import { randomInt, randomUUID } from 'node:crypto';
import { buildMiniAppLink, getCharacter, ONLINE_RULES, placementError, SNOWY_CHAOS } from '@doner-game/shared';
import type { MatchPhase, Movement, MovementSnapshot, OnlinePlayer, OnlineRoom, PlayerProfileDto, RoomCommand } from '@doner-game/shared';
import type { RoomStore } from './store.js';
import { displayName } from './store.js';
import { atFinish, initialMovement, validateMovement } from './movement.js';
import type { MovementHistory } from './movement.js';

export class RoomError extends Error { constructor(readonly code: string, message: string) { super(message); } }
const requireRoom = (condition: unknown, code: string, message: string): void => { if (!condition) throw new RoomError(code, message); };
export type RoomTiming = { buildMs: number; raceMs: number; reconnectGraceMs: number; roomTtlMs: number };
export class RoomManager {
  private rooms = new Map<string, OnlineRoom>();
  private queue: Promise<unknown> = Promise.resolve();
  private histories = new Map<string, Map<string, MovementHistory>>();
  private disconnectedAt = new Map<string, number>();
  private networkSequence = 0;
  private finishing = new Set<string>();
  onError: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | undefined;
  onSnapshot: (room: OnlineRoom) => void = () => {};
  onMovement: (snapshot: MovementSnapshot) => void = () => {};
  constructor(private store: RoomStore, private botUsername?: string, readonly timing: RoomTiming = ONLINE_RULES) {}
  async start() {
    for (const stored of await this.store.load()) {
      const room = structuredClone(stored);
      room.players.forEach(p => { p.connected = false; p.ready = false; this.disconnectedAt.set(p.playerId, Date.now()); });
      if (room.expiresAt <= Date.now()) this.phase(room, 'MATCH_FINISHED');
      else if (room.match.phase === 'RACE') {
        this.completeMissing(room, 'ABORTED'); this.phase(room, 'RESULTS');
        room.recoveryMessage = 'Сервер перезапущен. Незавершённый забег прерван; блоки сохранены. Host может начать следующий раунд.';
      }
      await this.commit(room);
    }
    this.timer = setInterval(() => { const now = Date.now(); void this.serial(() => this.tick(now)).catch(() => this.onError()); this.broadcastMovement(); }, 1000 / ONLINE_RULES.snapshotHz);
    this.timer.unref();
  }
  async stop() { clearInterval(this.timer); await this.queue; }
  private serial<T>(action: () => Promise<T>): Promise<T> { const next = this.queue.then(action); this.queue = next.catch(() => {}); return next; }
  private phase(room: OnlineRoom, phase: MatchPhase) { room.match = { ...room.match, phase }; room.deadline = null; }
  private async commit(room: OnlineRoom, isNew = false) {
    room.revision++; room.match = { ...room.match, revision: room.revision };
    await this.store.save(room, isNew); this.rooms.set(room.roomId, room); this.onSnapshot(structuredClone(room));
  }
  private forUser(id: string) { return [...this.rooms.values()].find(r => r.match.phase !== 'MATCH_FINISHED' && r.players.some(p => p.playerId === id && !p.left)); }
  current(id: string) { const room = this.forUser(id); return room ? structuredClone(room) : null; }
  async connected(profile: PlayerProfileDto) {
    return this.serial(async () => {
      const current = this.forUser(profile.user.id); if (!current) return null;
      const room = structuredClone(current), p = room.players.find(p => p.playerId === profile.user.id)!;
      p.connected = true; p.displayName = displayName(profile.user.firstName, profile.user.username); p.photoUrl = profile.user.photoUrl;
      this.disconnectedAt.delete(p.playerId); await this.commit(room); return structuredClone(room);
    });
  }
  async disconnected(userId: string) {
    return this.serial(async () => {
      const current = this.forUser(userId); if (!current) return;
      const room = structuredClone(current), p = room.players.find(p => p.playerId === userId)!;
      p.connected = false; p.ready = false; this.disconnectedAt.set(userId, Date.now()); await this.commit(room);
    });
  }
  async command(profile: PlayerProfileDto, command: RoomCommand): Promise<OnlineRoom | null> {
    return this.serial(async () => {
      const userId = profile.user.id;
      let current = this.forUser(userId);
      if (command.type === 'RESUME') return current ? structuredClone(current) : null;
      if (command.type === 'CREATE') {
        requireRoom(!current, 'ALREADY_IN_ROOM', 'Сначала выйдите из текущей комнаты.');
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code: string; do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while ([...this.rooms.values()].some(r => r.code === code));
        const id = randomUUID();
        const room: OnlineRoom = { roomId: id, code, hostId: userId, capacity: command.capacity, revision: 0, expiresAt: Date.now() + this.timing.roomTtlMs,
          deadline: null, raceStartedAt: null, inviteLink: this.botUsername ? buildMiniAppLink(this.botUsername, `room_${code}`) : null, recoveryMessage: null,
          players: [this.player(profile, 0)], finishes: [], match: { matchId: id, arenaId: SNOWY_CHAOS.id, arenaRevision: SNOWY_CHAOS.revision, revision: 0, phase: 'LOBBY', round: 0, placements: [], results: [] } };
        await this.commit(room, true); return structuredClone(room);
      }
      if (command.type === 'JOIN') {
        const target = [...this.rooms.values()].find(r => r.code === command.code.toUpperCase());
        requireRoom(target, 'ROOM_NOT_FOUND', 'Комната не найдена или уже истекла.');
        requireRoom(target!.expiresAt > Date.now(), 'ROOM_EXPIRED', 'Срок комнаты истёк.');
        requireRoom(target!.match.phase !== 'MATCH_FINISHED', 'ROOM_CLOSED', 'Матч завершён. Создайте новую комнату.');
        requireRoom(!current || current.roomId === target!.roomId, 'ALREADY_IN_ROOM', 'Сначала выйдите из текущей комнаты.');
        if (current) return structuredClone(current);
        const room = structuredClone(target!);
        requireRoom(room.match.phase === 'LOBBY', 'MATCH_STARTED', 'Матч уже начался.');
        requireRoom(room.players.filter(p => !p.left).length < room.capacity, 'ROOM_FULL', 'В комнате нет свободных мест.');
        const seat = [0, 1, 2, 3].find(s => !room.players.some(p => !p.left && p.seat === s))!;
        room.players = room.players.filter(p => p.playerId !== userId); room.players.push(this.player(profile, seat));
        await this.commit(room); return structuredClone(room);
      }
      requireRoom(current, 'NOT_IN_ROOM', 'Вы не состоите в комнате.');
      const room = structuredClone(current!), player = room.players.find(p => p.playerId === userId && !p.left)!;
      requireRoom(room.expiresAt > Date.now(), 'ROOM_EXPIRED', 'Срок комнаты истёк.');
      const host = () => requireRoom(room.hostId === userId, 'HOST_ONLY', 'Это действие доступно host.');
      const phase = (expected: MatchPhase) => requireRoom(room.match.phase === expected, 'WRONG_PHASE', 'Фаза уже изменилась.');
      switch (command.type) {
        case 'LEAVE':
          player.left = true; player.connected = false; player.ready = false; player.buildDone = true;
          this.histories.get(room.roomId)?.delete(userId);
          if (room.match.phase === 'RACE' && !room.finishes.some(f => f.round === room.match.round && f.playerId === userId)) room.finishes.push({ playerId: userId, round: room.match.round, status: 'DNF', position: null, durationMs: null, finishedAt: null });
          if (!room.players.some(p => !p.left)) this.phase(room, 'MATCH_FINISHED');
          else if (room.hostId === userId) room.hostId = (room.players.find(p => !p.left && p.connected) ?? room.players.find(p => !p.left))!.playerId;
          this.advance(room); await this.commit(room); return null;
        case 'READY': phase('LOBBY'); player.ready = command.ready; break;
        case 'CHARACTER': phase('LOBBY'); requireRoom(getCharacter(command.characterId), 'INVALID_CHARACTER', 'Персонаж недоступен.'); player.characterId = command.characterId; player.ready = false; break;
        case 'START':
          host(); phase('LOBBY');
          requireRoom(room.players.filter(p => !p.left).length >= 2, 'NEED_PLAYERS', 'Нужно минимум два игрока.');
          requireRoom(room.players.filter(p => !p.left).every(p => p.connected && p.ready), 'NOT_READY', 'Дождитесь подключения и готовности всех игроков.');
          this.build(room); break;
        case 'PLACE': {
          const duplicate = room.match.placements.find(p => p.id === command.commandId);
          if (duplicate) { requireRoom(duplicate.ownerId === userId && duplicate.round === command.round && duplicate.x === command.position.x && duplicate.y === command.position.y, 'DUPLICATE_COMMAND', 'Этот запрос уже использован.'); return structuredClone(room); }
          phase('BUILD');
          requireRoom(command.round === room.match.round, 'STALE_ROUND', 'Раунд уже изменился.');
          requireRoom(command.expectedRevision === room.revision, 'STALE_REVISION', 'Карта обновилась. Проверьте место и повторите.');
          requireRoom(!player.buildDone, 'ALREADY_BUILT', 'Ваш ход уже завершён.');
          const error = placementError(SNOWY_CHAOS, room.match.placements, command.position, ONLINE_RULES.maxPlacements);
          requireRoom(!error, 'INVALID_PLACEMENT', error ?? 'Недопустимое место.');
          room.match = { ...room.match, placements: [...room.match.placements, { id: command.commandId, ownerId: userId, round: room.match.round, catalogId: 'basic-platform', ...command.position, width: 32, height: 16 }] };
          player.buildDone = true; this.advance(room); break;
        }
        case 'SKIP': phase('BUILD'); requireRoom(command.round === room.match.round, 'STALE_ROUND', 'Раунд уже изменился.'); player.buildDone = true; this.advance(room); break;
        case 'NEXT': host(); phase('RESULTS'); if (room.match.round >= ONLINE_RULES.maxRounds) this.phase(room, 'MATCH_FINISHED'); else this.build(room); break;
        case 'CLOSE': host(); if (room.match.phase === 'RACE') this.completeMissing(room, 'ABORTED'); this.phase(room, 'MATCH_FINISHED'); break;
      }
      await this.commit(room); return structuredClone(room);
    });
  }
  private player(profile: PlayerProfileDto, seat: number): OnlinePlayer {
    return { playerId: profile.user.id, displayName: displayName(profile.user.firstName, profile.user.username), photoUrl: profile.user.photoUrl,
      characterId: getCharacter(profile.progress.selectedCharacterId)?.id ?? 'altoha', ready: false, connected: true, left: false, buildDone: false, seat };
  }
  private build(room: OnlineRoom) {
    this.phase(room, 'BUILD'); room.match = { ...room.match, round: room.match.round + 1 };
    room.deadline = Date.now() + this.timing.buildMs; room.raceStartedAt = null; room.recoveryMessage = null;
    room.players.forEach(p => { p.buildDone = p.left; }); this.histories.delete(room.roomId);
  }
  private advance(room: OnlineRoom) {
    if (room.match.phase === 'BUILD' && room.players.filter(p => !p.left).every(p => p.buildDone)) {
      this.phase(room, 'RACE'); room.raceStartedAt = Date.now(); room.deadline = room.raceStartedAt + this.timing.raceMs;
      this.histories.set(room.roomId, new Map(room.players.filter(p => !p.left).map(p => [p.playerId, initialMovement(p.playerId, p.seat, room.match.round, room.raceStartedAt!)])));
    }
    if (room.match.phase === 'RACE' && room.players.filter(p => !p.left).every(p => room.finishes.some(f => f.round === room.match.round && f.playerId === p.playerId))) this.phase(room, 'RESULTS');
  }
  private completeMissing(room: OnlineRoom, status: 'DNF' | 'ABORTED') {
    for (const p of room.players.filter(p => !p.left)) if (!room.finishes.some(f => f.playerId === p.playerId && f.round === room.match.round)) room.finishes.push({ playerId: p.playerId, round: room.match.round, status, position: null, durationMs: null, finishedAt: null });
  }
  private async tick(now: number) {
    for (const current of this.rooms.values()) {
      if (current.match.phase === 'MATCH_FINISHED') { if (now > current.expiresAt) { this.rooms.delete(current.roomId); this.histories.delete(current.roomId); } continue; }
      const room = structuredClone(current); let changed = false;
      if (room.expiresAt <= now) { if (room.match.phase === 'RACE') this.completeMissing(room, 'DNF'); this.phase(room, 'MATCH_FINISHED'); changed = true; }
      else if (room.deadline !== null && now >= room.deadline) {
        if (room.match.phase === 'BUILD') { room.players.forEach(p => { p.buildDone = true; }); this.advance(room); }
        else if (room.match.phase === 'RACE') { this.completeMissing(room, 'DNF'); this.phase(room, 'RESULTS'); }
        changed = true;
      }
      const host = room.players.find(p => p.playerId === room.hostId);
      if (host && !host.connected && now - (this.disconnectedAt.get(host.playerId) ?? now) >= this.timing.reconnectGraceMs) {
        const next = room.players.find(p => p.connected && !p.left); if (next) { room.hostId = next.playerId; changed = true; }
      }
      if (changed) await this.commit(room);
    }
  }
  movement(userId: string, move: Movement) {
    const room = this.forUser(userId); if (!room || room.match.phase !== 'RACE' || (room.deadline !== null && Date.now() >= room.deadline)) return null;
    const history = this.histories.get(room.roomId)?.get(userId); if (!history) return null;
    if (move.round !== room.match.round || move.sequence <= history.state.sequence) return null;
    if (!validateMovement(history, move, [...SNOWY_CHAOS.geometry, ...room.match.placements], Date.now())) return { ...history.state };
    const finishKey = `${room.roomId}:${move.round}:${userId}`;
    if (atFinish(move) && !this.finishing.has(finishKey)) {
      this.finishing.add(finishKey); const finishedAt = Date.now();
      void this.serial(async () => {
        const current = this.rooms.get(room.roomId)!;
        if (current.match.phase !== 'RACE' || current.match.round !== move.round || current.finishes.some(f => f.playerId === userId && f.round === move.round)) return;
        const next = structuredClone(current);
        const position = next.finishes.filter(f => f.round === move.round && f.status === 'FINISHED').length + 1;
        next.finishes.push({ playerId: userId, round: move.round, status: 'FINISHED', position, finishedAt, durationMs: finishedAt - next.raceStartedAt! });
        this.advance(next); await this.commit(next); history.state.finished = true;
      }).catch(() => this.onError()).finally(() => { this.finishing.delete(finishKey); });
    }
    return null;
  }
  movementSnapshot(userId: string) {
    const room = this.forUser(userId); return room ? this.motion(room) : null;
  }
  private motion(room: OnlineRoom): MovementSnapshot {
    return { roomId: room.roomId, round: room.match.round, sequence: ++this.networkSequence, serverTime: Date.now(), players: [...(this.histories.get(room.roomId)?.values() ?? [])].map(h => ({ ...h.state })) };
  }
  private broadcastMovement() { for (const room of this.rooms.values()) if (room.match.phase === 'RACE') this.onMovement(this.motion(room)); }
}
