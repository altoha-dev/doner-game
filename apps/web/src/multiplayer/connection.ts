import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { ONLINE_RULES } from '@doner-game/shared';
import type { ArenaSession, BuildPreview, ClientEvents, MatchSnapshot, MovementSnapshot, OnlineRoom, Point, RaceControls, RoomCommand, RoomReply, ServerEvents } from '@doner-game/shared';

export interface ConnectionView {
  room: OnlineRoom | null; status: 'connecting' | 'connected' | 'reconnecting' | 'error';
  error: string | null; pending: boolean; authExpired: boolean; previews: readonly BuildPreview[];
}
export interface NetworkBridge {
  localId: string;
  getRoom(): OnlineRoom | null;
  isConnected(): boolean;
  sendInput(input: RaceControls): void;
  subscribeMovement(listener: (snapshot: MovementSnapshot, reset: boolean) => void): () => void;
  getMovement(): MovementSnapshot | null;
  setPreview(position: Point | null): void;
  getPreviews(): readonly BuildPreview[];
  subscribePreviews(listener: () => void): () => void;
}
export function createRoomConnection(url: string, token: string, userId: string) {
  let view: ConnectionView = { room: null, status: 'connecting', error: null, pending: false, authExpired: false, previews: [] };
  let lastMatch: MatchSnapshot | null = null;
  let destroyed = false, movement: MovementSnapshot | null = null;
  let previewSequence = 0, receivedPreviewSequence = -1, intent: Point | null = null, sentPreview = '', sentAt = 0;
  const expiry = new Map<string, number>();
  const listeners = new Set<() => void>(), motionListeners = new Set<(s: MovementSnapshot, reset: boolean) => void>(), previewListeners = new Set<() => void>();
  const socket: Socket<ServerEvents, ClientEvents> = io(url, { auth: { token }, autoConnect: false, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000, timeout: 8000, transports: ['websocket', 'polling'], tryAllTransports: true });
  const update = (patch: Partial<ConnectionView>) => { if (!destroyed) { view = { ...view, ...patch }; listeners.forEach(fn => fn()); } };
  const previews = (values: readonly BuildPreview[]) => { update({ previews: values }); previewListeners.forEach(fn => fn()); };
  const snapshot = (room: OnlineRoom | null) => {
    if (room && view.room?.roomId === room.roomId && room.revision < view.room.revision) return;
    if (room?.roomId !== view.room?.roomId || room?.match.round !== view.room?.match.round) { movement = null; receivedPreviewSequence = -1; intent = null; previews([]); }
    if (room) lastMatch = room.match;
    update({ room });
    if (!room || room.match.phase !== 'BUILD') { intent = null; previews([]); }
    else previews(view.previews.filter(p => room.players.some(member => member.playerId === p.playerId && !member.left && member.connected && !member.buildDone)));
    try { if (room && room.match.phase !== 'MATCH_FINISHED') sessionStorage.setItem('doner-active-room', room.code); else sessionStorage.removeItem('doner-active-room'); } catch { /* optional storage */ }
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
  socket.on('connect', () => {
    movement = null; receivedPreviewSequence = -1; previewSequence = 0; sentPreview = '';
    update({ status: 'connected', error: null, authExpired: false }); void request({ type: 'RESUME' });
  });
  socket.on('disconnect', reason => { intent = null; previews([]); update({ status: reason === 'io server disconnect' ? 'error' : 'reconnecting', pending: false }); });
  socket.on('connect_error', error => update({ status: 'error', error: error.message === 'INVALID_ACCESS_TOKEN' ? 'Сессия истекла. Подключите аккаунт заново.' : 'Нет соединения с комнатой. Повторяем подключение…', authExpired: error.message === 'INVALID_ACCESS_TOKEN' }));
  socket.on('room:snapshot', snapshot);
  socket.on('race:snapshot', value => {
    if (value.roomId !== view.room?.roomId || value.round !== view.room.match.round || (movement && value.sequence <= movement.sequence)) return;
    const reset = !movement; movement = value; motionListeners.forEach(fn => fn(value, reset));
  });
  socket.on('build:previews', value => {
    if (value.roomId !== view.room?.roomId || value.round !== view.room.match.round || view.room.match.phase !== 'BUILD' || value.sequence <= receivedPreviewSequence) return;
    receivedPreviewSequence = value.sequence;
    const now = Date.now();
    for (const p of value.previews) expiry.set(p.playerId, now + Math.max(0, p.expiresAt - value.serverTime));
    previews(value.previews);
  });
  socket.on('session:error', error => update({ error: error.message, authExpired: error.code === 'INVALID_ACCESS_TOKEN', status: 'error' }));
  function flushPreview() {
    const room = view.room, now = Date.now();
    if (!socket.connected || destroyed || room?.match.phase !== 'BUILD' || room.players.find(p => p.playerId === userId)?.buildDone) return;
    const key = `${room.match.round}:${intent ? `${intent.x}:${intent.y}` : 'none'}`;
    if (key === sentPreview && (!intent || now - sentAt < ONLINE_RULES.previewHeartbeatMs)) return;
    if (now - sentAt < 1000 / ONLINE_RULES.previewHz) return;
    sentAt = now; sentPreview = key;
    socket.volatile.emit('build:preview', { round: room.match.round, sequence: ++previewSequence, objectType: 'basic-platform', position: intent ? { ...intent } : null });
  }
  const previewTimer = setInterval(() => {
    flushPreview();
    const fresh = view.previews.filter(p => (expiry.get(p.playerId) ?? 0) > Date.now());
    if (fresh.length !== view.previews.length) previews(fresh);
  }, 1000 / ONLINE_RULES.previewHz);
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const bridge: NetworkBridge = {
    localId: userId, getRoom: () => view.room, getMovement: () => movement, isConnected: () => view.status === 'connected',
    sendInput(input) { if (socket.connected && view.status === 'connected') socket.volatile.emit('race:input', input); },
    subscribeMovement(fn) { motionListeners.add(fn); return () => { motionListeners.delete(fn); }; },
    setPreview(position) { intent = position; flushPreview(); },
    getPreviews: () => view.previews,
    subscribePreviews(fn) { previewListeners.add(fn); return () => { previewListeners.delete(fn); }; },
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
    destroy() { destroyed = true; clearInterval(previewTimer); socket.removeAllListeners(); socket.disconnect(); listeners.clear(); motionListeners.clear(); previewListeners.clear(); },
  };
}
export type RoomConnection = ReturnType<typeof createRoomConnection>;
