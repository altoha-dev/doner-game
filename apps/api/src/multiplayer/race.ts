import { createPhysicsPlayer, PLAYER_PHYSICS, SNOWY_CHAOS, stepPlayers } from '@doner-game/shared';
import type { NetworkImpact, NetworkPlayer, OnlinePlayer, PlayerControls, RaceControls, Rect } from '@doner-game/shared';

/** Ephemeral authoritative world: fixed ticks, bounded input, no SQL or client coordinates. */
export class RaceSimulation {
  readonly players: NetworkPlayer[];
  tick = 0;
  private accumulator = 0;
  private lastAt: number;
  private inputs = new Map<string, { value: RaceControls; at: number }>();
  private connected = new Set<string>();
  private effects: NetworkImpact[] = [];
  private impactAt = new Map<string, number>();
  constructor(players: OnlinePlayer[], readonly round: number, private solids: readonly Rect[], now: number) {
    this.lastAt = now;
    this.players = players.map(p => {
      if (p.connected) this.connected.add(p.playerId);
      const spawn = SNOWY_CHAOS.spawns[p.seat]!;
      return { ...createPhysicsPlayer(p.playerId, p.seat, spawn.x, spawn.y), active: false, round };
    });
  }
  input(userId: string, value: RaceControls, now: number) {
    const player = this.players.find(p => p.playerId === userId);
    if (!player || !this.connected.has(userId) || player.finished || value.round !== this.round ||
      value.sequence <= Math.max(player.sequence, this.inputs.get(userId)?.value.sequence ?? 0)) return;
    this.inputs.set(userId, { value, at: now });
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
        const received = this.inputs.get(player.playerId);
        player.active = this.connected.has(player.playerId) && Boolean(received && now - received.at <= PLAYER_PHYSICS.inputTimeoutMs) && !player.finished;
        if (player.active && received) controls.set(player.playerId, received.value);
      }
      for (const impact of stepPlayers(this.players, controls, this.solids, SNOWY_CHAOS.width, SNOWY_CHAOS.height)) {
        const key = `${impact.kind}:${impact.a}:${impact.b}`;
        if (now - (this.impactAt.get(key) ?? -Infinity) < PLAYER_PHYSICS.impactCooldownMs) continue;
        this.impactAt.set(key, now);
        this.effects.push({ ...impact, id: `${this.round}:${this.tick}:${key}`, tick: this.tick });
      }
    }
    this.effects = this.effects.filter(e => this.tick - e.tick < PLAYER_PHYSICS.tickHz / 2).slice(-16);
  }
  snapshot() { return { tick: this.tick, players: this.players.map(p => ({ ...p })), impacts: this.effects.map(e => ({ ...e })) }; }
}
