import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import type { ClientEvents, PlayerProfileDto, ServerEvents } from '@doner-game/shared';
import type { ApiConfig } from '../config.js';
import type { PlayerStore } from '../players.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { RoomError, RoomManager } from './manager.js';
import type { RoomTiming } from './manager.js';
import { roomStore } from './store.js';
import { parseCommand, parseMovement, RateGate } from './validation.js';
interface SocketData { profile: PlayerProfileDto; expiresAt: number }

export async function attachMultiplayer(app: FastifyInstance, config: ApiConfig, players: PlayerStore, db: PrismaClient, timing?: RoomTiming) {
  const manager = new RoomManager(roomStore(db, config.botUsername), config.botUsername, timing);
  manager.onError = () => app.log.error({ code: 'ROOM_STATE_FAILED' }, 'Room state update failed');
  await manager.start();
  const gate = new RateGate();
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(app.server, {
    cors: { origin: config.corsOrigins, credentials: false }, maxHttpBufferSize: 8192,
    pingInterval: 10000, pingTimeout: 10000,
    allowRequest: (request, callback) => callback(null, !request.headers.origin || config.corsOrigins.includes(request.headers.origin)),
  });
  const users = new Map<string, string>();
  manager.onSnapshot = room => io.to(room.roomId).emit('room:snapshot', room);
  manager.onMovement = snapshot => io.to(snapshot.roomId).volatile.emit('race:snapshot', snapshot);
  io.use(async (socket, next) => {
    if (!gate.take(`connect:${socket.handshake.address}`, 60, 60000)) return next(new Error('RATE_LIMITED'));
    try {
      const token: unknown = socket.handshake.auth.token;
      if (typeof token !== 'string' || token.length > 4096) throw new Error();
      const payload = app.jwt.verify<{ sub: string; exp: number }>(token);
      if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub) || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) throw new Error();
      const profile = await players.findById(payload.sub); if (!profile) throw new Error();
      socket.data = { profile, expiresAt: payload.exp * 1000 }; next();
    } catch { next(new Error('INVALID_ACCESS_TOKEN')); }
  });
  io.on('connection', socket => {
    const profile = socket.data.profile, userId = profile.user.id;
    const previous = users.get(userId); users.set(userId, socket.id);
    if (previous) {
      const old = io.sockets.sockets.get(previous);
      old?.emit('session:error', { code: 'SESSION_REPLACED', message: 'Аккаунт подключён в другом окне. Используйте одно окно игры.' }); old?.disconnect(true);
    }
    const expiry = setTimeout(() => {
      socket.emit('session:error', { code: 'INVALID_ACCESS_TOKEN', message: 'Сессия истекла. Подключите аккаунт заново.' }); socket.disconnect(true);
    }, Math.max(1, socket.data.expiresAt - Date.now())); expiry.unref();
    const ready = manager.connected(profile).then(async room => {
      if (!socket.connected || users.get(userId) !== socket.id) return;
      if (room) { await socket.join(room.roomId); socket.emit('room:snapshot', room); const motion = manager.movementSnapshot(userId); if (motion) socket.emit('race:snapshot', motion); }
    });
    void ready.catch(() => { socket.emit('session:error', { code: 'SERVER_ERROR', message: 'Не удалось восстановить комнату. Повторите подключение.' }); socket.disconnect(true); });
    socket.on('room:command', (raw, ack) => {
      if (typeof ack !== 'function') return;
      void (async () => {
        await ready;
        if (!socket.connected || users.get(userId) !== socket.id || Date.now() >= socket.data.expiresAt) throw new RoomError('INVALID_ACCESS_TOKEN', 'Подключите аккаунт заново.');
        const command = parseCommand(raw); if (!command) throw new RoomError('INVALID_REQUEST', 'Некорректный запрос.');
        if (!gate.take(`command:${userId}`, 90, 60000) || (['CREATE', 'JOIN'].includes(command.type) && !gate.take(`join:${userId}`, 12, 60000))) throw new RoomError('RATE_LIMITED', 'Слишком много действий. Подождите немного.');
        const before = manager.current(userId);
        const room = await manager.command(profile, command);
        if (before && (!room || room.roomId !== before.roomId)) await socket.leave(before.roomId);
        if (room) await socket.join(room.roomId);
        ack({ ok: true, room });
      })().catch((error: unknown) => {
        if (error instanceof RoomError) ack({ ok: false, code: error.code, message: error.message });
        else { app.log.error({ code: 'ROOM_ACTION_FAILED' }, 'Room action failed'); ack({ ok: false, code: 'SERVER_ERROR', message: 'Не удалось подтвердить действие. Повторите запрос.' }); }
      });
    });
    socket.on('race:move', raw => {
      if (users.get(userId) !== socket.id || Date.now() >= socket.data.expiresAt || !gate.take(`move:${userId}`, 35, 1000)) return;
      const move = parseMovement(raw); if (!move) return;
      const correction = manager.movement(userId, move); if (correction) socket.emit('race:correction', correction);
    });
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      if (users.get(userId) === socket.id) { users.delete(userId); void manager.disconnected(userId).catch(() => {}); }
    });
  });
  app.addHook('preClose', async () => { io.disconnectSockets(true); io.engine.close(); await manager.stop(); });
  return { io, manager };
}
