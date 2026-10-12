import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { AuthResponseDto } from '@doner-game/shared';
import type { ApiConfig } from './config.js';
import { createAuthGuard } from './auth.js';
import { ApiError, errorResponse } from './errors.js';
import type { PlayerStore } from './players.js';
import { validateTelegramInitData } from './telegram-auth.js';

export async function buildApp(config: ApiConfig, players: PlayerStore, logging = true) {
  const app = Fastify({
    bodyLimit: 32 * 1024,
    requestTimeout: 15000,
    trustProxy: (_address: string, hop: number) => hop < config.trustProxyHops,
    logController: new LogController({ disableRequestLogging: true }),
    logger: logging ? {
      level: 'info',
      redact: ['req.headers.authorization', 'req.body', 'res.body', 'accessToken', 'initData', 'BOT_TOKEN', 'JWT_SECRET', 'DATABASE_URL'],
    } : false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(errorResponse(error.code, error.message));
    }
    const status = typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : undefined;
    if (status === 429) return reply.code(429).send(errorResponse('RATE_LIMITED', 'Too many authentication attempts. Try again later.'));
    if (status === 413) return reply.code(413).send(errorResponse('REQUEST_TOO_LARGE', 'Request body is too large.'));
    if (status === 400 || status === 415) return reply.code(400).send(errorResponse('INVALID_REQUEST', 'Invalid request body.'));
    // Never serialize raw errors: Prisma/network errors can include connection strings.
    app.log.error({ requestId: request.id, code: 'INTERNAL_ERROR' }, 'API request failed');
    return reply.code(500).send(errorResponse('INTERNAL_ERROR', 'Internal server error.'));
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send(errorResponse('NOT_FOUND', 'Endpoint not found.')));
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.addHook('onResponse', async (request, reply) => {
    // Log only method + registered route, never the raw URL, headers or bodies.
    app.log.info({ requestId: request.id, method: request.method, route: request.routeOptions.url ?? 'not-found', statusCode: reply.statusCode }, 'Request completed');
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  });
  await app.register(rateLimit, { global: false, max: 10, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { algorithm: 'HS256', expiresIn: '1h', iss: 'doner-game', aud: 'doner-game-api' },
    verify: { algorithms: ['HS256'], allowedIss: 'doner-game', allowedAud: 'doner-game-api' },
  });

  const authenticate = createAuthGuard(app, players);
  app.get('/health', async () => ({ status: 'ok' }));
  app.post<{ Body: { initData: string } }>('/auth/telegram', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['initData'],
        additionalProperties: false,
        properties: { initData: { type: 'string', minLength: 1, maxLength: 16384 } },
      },
    },
  }, async (request): Promise<AuthResponseDto> => {
    const identity = validateTelegramInitData(request.body.initData, config.botToken, config.telegramMaxAgeSeconds);
    const profile = await players.login(identity);
    return { ...profile, accessToken: app.jwt.sign({ sub: profile.user.id }), expiresIn: 3600 };
  });
  app.get('/me', { preHandler: authenticate }, async (request) => request.playerProfile);

  return app;
}
