import { fanForces, overlaps, PLAYER_PHYSICS as cfg, playerBody, stepPlayers } from '@doner-game/shared';
import type { ArenaDefinition, MovementSnapshot, NetworkPlayer, Point, Rect, TrapPlacement } from '@doner-game/shared';

/** Timestamp history, independent of packet arrival cadence. No unbounded extrapolation. */
export class SnapshotBuffer {
  private frames: { value: MovementSnapshot; at: number }[] = [];
  private offsets: number[] = [];
  private playhead = -Infinity;
  private sampledAt = 0;
  jitter = 0;
  get delayMs() { return Math.min(cfg.interpolationMaxMs, cfg.interpolationMinMs + this.jitter * 2); }
  constructor(private arena: ArenaDefinition, private solids: readonly Rect[]) {}
  push(value: MovementSnapshot, at: number, reset = false) {
    if (reset) { this.frames = []; this.offsets = []; this.playhead = -Infinity; this.jitter = 0; }
    const last = this.frames.at(-1);
    if (last && (value.sequence <= last.value.sequence || value.tick < last.value.tick)) return false;
    if (last) this.jitter += .1 * (Math.abs(at - last.at - (value.serverTime - last.value.serverTime)) - this.jitter);
    this.frames.push({ value, at }); this.frames = this.frames.slice(-32);
    this.offsets.push(at - value.serverTime); this.offsets = this.offsets.slice(-32);
    return true;
  }
  sample(now: number): NetworkPlayer[] {
    const first = this.frames[0], last = this.frames.at(-1); if (!first || !last) return [];
    const target = now - Math.min(...this.offsets) - this.delayMs;
    // Buffer adaptation changes clock speed gently, never moves the presentation clock backwards.
    this.playhead = Number.isFinite(this.playhead) ? Math.max(this.playhead, Math.min(target, this.playhead + Math.max(0, now - this.sampledAt) * 1.1)) : target;
    this.sampledAt = now;
    const time = this.playhead;
    if (time <= first.value.serverTime) return first.value.players.map(p => ({ ...p }));
    for (let i = 1; i < this.frames.length; i++) {
      const a = this.frames[i - 1]!.value, b = this.frames[i]!.value;
      if (time > b.serverTime) continue;
      const alpha = Math.max(0, Math.min(1, (time - a.serverTime) / Math.max(1, b.serverTime - a.serverTime)));
      return b.players.map(p => {
        const previous = a.players.find(other => other.playerId === p.playerId) ?? p;
        const from = (previous.life?.serial ?? 0) === (p.life?.serial ?? 0) ? previous : p;
        return { ...(alpha < .5 ? from : p), x: from.x + (p.x - from.x) * alpha, y: from.y + (p.y - from.y) * alpha,
          velocityX: from.velocityX + (p.velocityX - from.velocityX) * alpha, velocityY: from.velocityY + (p.velocityY - from.velocityY) * alpha };
      });
    }
    const players = last.value.players.map(p => ({ ...p }));
    let remaining = Math.min(cfg.extrapolationMs, Math.max(0, time - last.value.serverTime));
    const stepMs = 1000 / cfg.tickHz;
    while (remaining > .001) {
      const previous = players.map(p => ({ ...p }));
      stepPlayers(players, new Map(players.map(p => [p.playerId, { sequence: p.sequence, direction: p.direction, jump: p.jumpSerial }])), this.solids, this.arena.width, this.arena.height, fanForces(players, this.solids.filter((s): s is TrapPlacement => 'catalogId' in s)));
      if (remaining < stepMs) players.forEach((p, i) => { p.x = previous[i]!.x + (p.x - previous[i]!.x) * remaining / stepMs; p.y = previous[i]!.y + (p.y - previous[i]!.y) * remaining / stepMs; });
      remaining -= stepMs;
    }
    return players;
  }
}

/** Physics is never edited by presentation. Contact groups share one bounded visual offset. */
export class RacePresentation {
  readonly buffer: SnapshotBuffer;
  private offset: Point = { x: 0, y: 0 };
  private lastOwn: Point | null = null;
  constructor(private localId: string, private arena: ArenaDefinition, private solids: readonly Rect[]) {
    this.buffer = new SnapshotBuffer(arena, solids);
  }
  receive(snapshot: MovementSnapshot, predicted: readonly NetworkPlayer[], now: number, reset: boolean) {
    this.buffer.push(snapshot, now, reset);
    const own = predicted.find(p => p.playerId === this.localId);
    if (!own || !this.lastOwn || reset) { this.offset = { x: 0, y: 0 }; return; }
    const dx = this.lastOwn.x - own.x, dy = this.lastOwn.y - own.y, distance = Math.hypot(dx, dy);
    const scale = distance > cfg.correctionSnapDistance ? 0 : Math.min(1, cfg.renderMaxOffset / Math.max(.001, distance));
    this.offset = { x: dx * scale, y: dy * scale };
  }
  private free(point: Point) {
    const body = playerBody(point), inset = .002;
    return body.x >= -inset && body.x + body.width <= this.arena.width + inset && body.y >= -inset && point.y <= this.arena.height + inset &&
      !this.solids.some(s => overlaps({ x: body.x + inset, y: body.y + inset, width: body.width - 2 * inset, height: body.height - 2 * inset }, s));
  }
  sample(predicted: readonly NetworkPlayer[], now: number, delta: number): NetworkPlayer[] {
    const own = predicted.find(p => p.playerId === this.localId); if (!own) return [];
    const decay = Math.exp(-Math.max(0, delta) / cfg.correctionMs);
    this.offset = { x: this.offset.x * decay, y: this.offset.y * decay };
    const group = new Set([own.playerId]);
    for (let pass = 0; pass < predicted.length; pass++) for (const p of predicted) if (p.active && !p.finished && !group.has(p.playerId) && predicted.some(q => group.has(q.playerId) &&
      (p.supportId === q.playerId || q.supportId === p.playerId || (Math.abs(p.x - q.x) <= cfg.width + .05 && Math.abs(p.y - q.y) <= cfg.height + .05)))) group.add(p.playerId);
    const members = predicted.filter(p => group.has(p.playerId));
    // A common translation preserves head/body contact; clamp it for every wall/ceiling in the group.
    let fraction = 1;
    for (let step = 1; step <= Math.ceil(cfg.renderMaxOffset); step++) {
      const f = step / Math.ceil(cfg.renderMaxOffset);
      if (members.some(p => !this.free({ x: p.x + this.offset.x * f, y: p.y + this.offset.y * f }))) { fraction = (step - 1) / Math.ceil(cfg.renderMaxOffset); break; }
    }
    const offset = { x: this.offset.x * fraction, y: this.offset.y * fraction };
    const buffered = this.buffer.sample(now);
    const radius = cfg.width + cfg.speed * (this.buffer.delayMs / 1000 + cfg.remotePredictionSteps / cfg.tickHz);
    const result = predicted.map(p => {
      if (p.playerId === this.localId || group.has(p.playerId)) return { ...p, x: p.x + offset.x, y: p.y + offset.y };
      const remote = buffered.find(q => q.playerId === p.playerId) ?? p;
      // Never blend delayed pre-hit positions into a new life, even while the
      // buffer's target time still precedes the hit/respawn snapshot.
      if ((remote.life?.serial ?? 0) !== (p.life?.serial ?? 0)) return { ...p };
      const gap = Math.max(Math.abs(p.x - own.x) - cfg.width, Math.abs(p.y - own.y) - cfg.height, 0);
      const weight = p.active ? Math.max(0, Math.min(1, (radius - gap) / (radius - cfg.renderMaxOffset))) : 0;
      // Continuous transition into a shared contact timeline, instead of a binary proximity switch.
      const point = { x: remote.x + (p.x + offset.x - remote.x) * weight, y: remote.y + (p.y + offset.y - remote.y) * weight };
      return { ...(weight > .5 ? p : remote), ...(this.free(point) ? point : { x: p.x, y: p.y }) };
    });
    this.lastOwn = { x: result.find(p => p.playerId === this.localId)!.x, y: result.find(p => p.playerId === this.localId)!.y };
    return result;
  }
}
