import { createPhysicsPlayer, PLAYER_PHYSICS, SNOWY_CHAOS, TrapSimulation } from '@doner-game/shared';
import type { NetworkImpact, NetworkPlayer, OnlinePlayer, PlayerControls, RaceInputBatch, Rect, TrapPlacement } from '@doner-game/shared';

type InputStream = { frames: Map<number, PlayerControls>; received: number; at: number; held: PlayerControls };

/** Ephemeral authoritative world: fixed ticks, bounded input, no SQL or client coordinates. */
export class RaceSimulation {
  readonly players: NetworkPlayer[];
  tick = 0;
  private traps: TrapSimulation;
  private accumulator = 0;
  private lastAt: number;
  private inputs = new Map<string, InputStream>();
  private connected = new Set<string>();
  private effects: NetworkImpact[] = [];
  private impactAt = new Map<string, number>();
  constructor(players: OnlinePlayer[], readonly round: number, solids: readonly Rect[], now: number, placements: readonly TrapPlacement[] = []) {
    this.lastAt = now;
    this.traps = new TrapSimulation(SNOWY_CHAOS, placements, solids);
    this.players = players.map(p => {
      if (p.connected) this.connected.add(p.playerId);
      const spawn = SNOWY_CHAOS.spawns[p.seat]!;
      return { ...createPhysicsPlayer(p.playerId, p.seat, spawn.x, spawn.y), active: false, round };
    });
  }
  input(userId: string, value: RaceInputBatch, now: number) {
    const player = this.players.find(p => p.playerId === userId);
    if (!player || !this.connected.has(userId) || player.finished || (player.life && player.life.phase !== 'ALIVE') || value.round !== this.round || !value.frames.length) return;
    const latest = value.frames.at(-1)!;
    const fresh = value.frames.filter(frame => frame.sequence > player.sequence);
    let stream = this.inputs.get(userId);
    if (!stream) {
      if (!fresh.length) return;
      // Establish this connection's frame origin; no extra simulation is performed.
      player.sequence = fresh[0]!.sequence - 1;
      stream = { frames: new Map(), received: player.sequence, at: now,
        held: { sequence: player.sequence, direction: 0, jump: player.jumpSerial } };
      this.inputs.set(userId, stream);
    }
    if (latest.sequence > player.sequence + PLAYER_PHYSICS.maxPredictionSteps) return;
    for (const frame of fresh) if (!stream.frames.has(frame.sequence)) stream.frames.set(frame.sequence, { ...frame });
    const accepted = latest.sequence > stream.received;
    if (accepted) {
      stream.received = latest.sequence; stream.at = now;
      // A late but new command still proves liveness. Preserve its edge/intent for
      // the next tick; never rewind the consumed frame clock or replay movement twice.
      if (latest.sequence <= player.sequence) stream.held = { ...latest, sequence: player.sequence, jump: Math.max(latest.jump, player.jumpSerial) };
    }
    return accepted;
  }
  presence(userId: string, connected: boolean) {
    if (connected) this.connected.add(userId); else this.connected.delete(userId);
    this.inputs.delete(userId);
    const player = this.players.find(p => p.playerId === userId);
    if (player) { player.active = false; player.direction = 0; }
  }
  remove(userId: string) {
    const index = this.players.findIndex(p => p.playerId === userId);
    if (index >= 0) this.players.splice(index, 1);
    this.inputs.delete(userId); this.connected.delete(userId);
  }
  advance(now: number) {
    const stepMs = 1000 / PLAYER_PHYSICS.tickHz;
    this.accumulator += Math.max(0, Math.min(now - this.lastAt, stepMs * PLAYER_PHYSICS.maxCatchupSteps));
    this.lastAt = now;
    while (this.accumulator >= stepMs) {
      this.accumulator -= stepMs; this.tick++;
      const controls = new Map<string, PlayerControls>();
      for (const player of this.players) {
        const stream = this.inputs.get(player.playerId);
        player.active = this.connected.has(player.playerId) && Boolean(stream && now - stream.at <= PLAYER_PHYSICS.inputTimeoutMs) && !player.finished;
        if (player.active && stream) {
          const sequence = player.sequence + 1;
          const frame = stream.frames.get(sequence) ?? { ...stream.held, sequence };
          controls.set(player.playerId, frame); stream.held = frame;
          for (const key of stream.frames.keys()) if (key <= sequence) stream.frames.delete(key);
        }
      }
      for (const impact of this.traps.step(this.players, controls)) {
        const key = `${impact.kind}:${impact.a}:${impact.b}`;
        if (now - (this.impactAt.get(key) ?? -Infinity) < PLAYER_PHYSICS.impactCooldownMs) continue;
        this.impactAt.set(key, now);
        this.effects.push({ ...impact, id: `${this.round}:${this.tick}:${key}`, tick: this.tick });
      }
      for (const player of this.players) if (player.life && player.life.phase !== 'ALIVE') this.inputs.delete(player.playerId);
    }
    this.effects = this.effects.filter(e => this.tick - e.tick < PLAYER_PHYSICS.tickHz / 2).slice(-16);
  }
  snapshot() { return { tick: this.tick, traps: this.traps.snapshot(), players: this.players.map(p => ({ ...p })), impacts: this.effects.map(e => ({ ...e })) }; }
}
