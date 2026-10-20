import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { ONLINE_RULES } from '@doner-game/shared';
import type { ArenaSession, ClientEvents, MatchSnapshot, Movement, MovementSnapshot, NetworkPlayer, OnlineRoom, RoomCommand, RoomReply, ServerEvents } from '@doner-game/shared';

export interface ConnectionView { room: OnlineRoom | null; status: 'connecting' | 'connected' | 'reconnecting' | 'error'; error: string | null; pending: boolean; authExpired: boolean }
export interface NetworkBridge {
  localId: string;
  getRoom(): OnlineRoom | null;
  sendMovement(move: Movement): void;
  subscribeMovement(listener: (snapshot: MovementSnapshot) => void): () => void;
  subscribeCorrection(listener: (state: NetworkPlayer) => void): () => void;
  getMovement(): MovementSnapshot | null;
}
export function createRoomConnection(url: string, token: string, userId: string) {
  let view: ConnectionView = { room: null, status: 'connecting', error: null, pending: false, authExpired: false };
  let lastMatch: MatchSnapshot | null = null;
  let destroyed = false, movement: MovementSnapshot | null = null;
  const listeners = new Set<() => void>(), motionListeners = new Set<(s: MovementSnapshot) => void>(), corrections = new Set<(s: NetworkPlayer) => void>();
  const socket: Socket<ServerEvents, ClientEvents> = io(url, { auth: { token }, autoConnect: false, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000, timeout: 8000, transports: ['websocket', 'polling'], tryAllTransports: true });
  const update = (patch: Partial<ConnectionView>) => { if (!destroyed) { view = { ...view, ...patch }; listeners.forEach(fn => fn()); } };
  const snapshot = (room: OnlineRoom | null) => {
    if (room && view.room?.roomId === room.roomId && room.revision < view.room.revision) return;
    if (room) lastMatch = room.match;
    update({ room });
    try { if (room && room.match.phase !== 'MATCH_FINISHED') sessionStorage.setItem('doner-active-room', room.code); else sessionStorage.removeItem('doner-active-room'); } catch { /* storage is optional */ }
  };
  async function request(command: RoomCommand): Promise<RoomReply> {
    if (!socket.connected || destroyed) return { ok: false, code: 'DISCONNECTED', message: 'Дождитесь подключения.' };
    if (view.pending) return { ok: false, code: 'BUSY', message: 'Дождитесь ответа сервера.' };
    update({ pending: true, error: null });
    try {
      const reply = await socket.timeout(ONLINE_RULES.ackMs).emitWithAck('room:command', command);
      if (destroyed) return { ok: false, code: 'DISCONNECTED', message: 'Соединение закрыто.' };
      if (reply.ok) snapshot(reply.room); else update({ error: reply.message, authExpired: reply.code === 'INVALID_ACCESS_TOKEN' });
      return reply;
    } catch {
      const message = 'Сервер не ответил. Состояние будет сверено при повторном подключении.';
      update({ error: message }); return { ok: false, code: 'TIMEOUT', message };
    } finally { update({ pending: false }); }
  }
  socket.on('connect', () => { movement = null; update({ status: 'connected', error: null, authExpired: false }); void request({ type: 'RESUME' }); });
  socket.on('disconnect', reason => update({ status: reason === 'io server disconnect' ? 'error' : 'reconnecting', pending: false }));
  socket.on('connect_error', error => update({ status: 'error', error: error.message === 'INVALID_ACCESS_TOKEN' ? 'Сессия истекла. Подключите аккаунт заново.' : 'Нет соединения с комнатой. Повторяем подключение…', authExpired: error.message === 'INVALID_ACCESS_TOKEN' }));
  socket.on('room:snapshot', snapshot);
  socket.on('race:snapshot', value => {
    if (value.roomId !== view.room?.roomId || value.round !== view.room.match.round || (movement && value.sequence <= movement.sequence)) return;
    if (!movement) { const me = value.players.find(p => p.playerId === userId); if (me) corrections.forEach(fn => fn(me)); }
    movement = value; motionListeners.forEach(fn => fn(value));
  });
  socket.on('race:correction', value => { if (value.round === view.room?.match.round) corrections.forEach(fn => fn(value)); });
  socket.on('session:error', error => update({ error: error.message, authExpired: error.code === 'INVALID_ACCESS_TOKEN', status: 'error' }));
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const bridge: NetworkBridge = {
    localId: userId, getRoom: () => view.room, getMovement: () => movement,
    sendMovement(move) { if (socket.connected && view.status === 'connected') socket.volatile.emit('race:move', move); },
    subscribeMovement(fn) { motionListeners.add(fn); return () => { motionListeners.delete(fn); }; },
    subscribeCorrection(fn) { corrections.add(fn); return () => { corrections.delete(fn); }; },
  };
  const arenaSession: ArenaSession = {
    getSnapshot() { if (!lastMatch) throw new Error('No match has loaded'); return lastMatch; }, subscribe,
    dispatch(command) {
      const room = view.room;
      if (!room || view.status !== 'connected' || view.pending) return { ok: false, reason: 'Дождитесь соединения и ответа сервера.' };
      if (command.type === 'PLACE') void request({ type: 'PLACE', position: command.position, round: room.match.round, expectedRevision: room.revision, commandId: crypto.randomUUID() });
      else if (command.type === 'NEXT_ROUND') void request({ type: 'NEXT' });
      else return { ok: false, reason: 'Фазой управляет сервер.' };
      return { ok: true };
    },
  };
  return {
    getSnapshot: () => view, subscribe, request, bridge, arenaSession,
    connect() { socket.connect(); }, retry() { if (socket.connected) void request({ type: 'RESUME' }); else socket.connect(); },
    destroy() { destroyed = true; socket.removeAllListeners(); socket.disconnect(); listeners.clear(); motionListeners.clear(); corrections.clear(); },
  };
}
export type RoomConnection = ReturnType<typeof createRoomConnection>;
