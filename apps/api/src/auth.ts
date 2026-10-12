import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PlayerProfileDto } from '@doner-game/shared';
import { ApiError } from './errors.js';
import type { PlayerStore } from './players.js';

declare module 'fastify' {
  interface FastifyRequest {
    playerProfile: PlayerProfileDto | null;
  }
}

export function createAuthGuard(app: FastifyInstance, players: PlayerStore) {
  app.decorateRequest('playerProfile', null);

  return async (request: FastifyRequest): Promise<void> => {
    let subject: unknown;
    try {
      const payload = await request.jwtVerify<{ sub: unknown }>();
      subject = payload.sub;
    } catch {
      throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired.');
    }
    if (typeof subject !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(subject)) {
      throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired.');
    }
    request.playerProfile = await players.findById(subject);
    if (!request.playerProfile) {
      throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired.');
    }
  };
}
