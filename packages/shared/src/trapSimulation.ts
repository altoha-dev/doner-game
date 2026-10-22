import { overlaps } from './party.js';
import type { ArenaDefinition, Point, Rect, TrapPlacement } from './party.js';
import { createPhysicsPlayer, PLAYER_PHYSICS, playerBody, stepPlayers } from './physics.js';
import type { PhysicsPlayer, PlayerControls } from './physics.js';
import { getTrap, orientationVector, TRAP_RULES, trapOrientation, trapZone } from './traps.js';
import type { Projectile, TrapHit, TrapSnapshot } from './traps.js';

export function fanForces(players: readonly PhysicsPlayer[], placements: readonly TrapPlacement[]) {
  const forces = new Map<string, Point & { maxWind: number }>();
  for (const placement of placements) {
    const trap = getTrap(placement.catalogId); if (trap?.activation.kind !== 'fan') continue;
    const zone = trapZone(placement)!, direction = orientationVector(trapOrientation(trap.id, placement.orientation)!);
    for (const p of players) if (p.active && !p.finished && overlaps(playerBody(p), zone)) {
      const before = forces.get(p.playerId) ?? { x: 0, y: 0 };
      forces.set(p.playerId, { maxWind: trap.activation.maxWind, x: Math.max(-trap.activation.force, Math.min(trap.activation.force, before.x + direction.x * trap.activation.force)), y: Math.max(-trap.activation.lift, before.y + direction.y * trap.activation.lift) });
    }
  }
  return forces;
}
/** Continuous segment-vs-expanded-body collision; handles even thin walls between snapshots. */
export function segmentHit(a: Point, b: Point, rect: Rect, radius: number) {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y'] as const) {
    const min = rect[axis] - radius, max = rect[axis] + (axis === 'x' ? rect.width : rect.height) + radius;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < .00001) { if (a[axis] < min || a[axis] > max) return null; }
    else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return null;
    }
  }
  return enter;
}
/** Authority-only hazards/lifecycle. Client prediction uses fanForces + the existing shared solver. */
export class TrapSimulation {
  tick = 0;
  projectiles: Projectile[] = [];
  hits: TrapHit[] = [];
  private serial = 0;
  constructor(readonly arena: ArenaDefinition, readonly placements: readonly TrapPlacement[], readonly solids: readonly Rect[] = [...arena.geometry, ...placements]) {}
  private lifecycle(players: PhysicsPlayer[]) {
    for (const p of players) {
      const life = p.life; if (!life || life.phase === 'ALIVE') continue;
      if (this.tick >= life.untilTick) {
        if (life.phase === 'HIT') p.life = { ...life, phase: 'RESPAWNING', untilTick: this.tick + TRAP_RULES.respawnTicks };
        else {
          const spawn = this.arena.spawns[p.seat] ?? this.arena.spawns[0]!;
          // Preserve the input frame clock and jump edge: neither stale input nor an old hit can replay a respawn.
          const sequence = p.sequence, jumpSerial = p.jumpSerial, active = p.active;
          Object.assign(p, createPhysicsPlayer(p.playerId, p.seat, spawn.x, spawn.y), { sequence, jumpSerial, active, windX: 0,
            life: { phase: 'ALIVE', serial: life.serial + 1, failures: life.failures, untilTick: 0, immuneUntilTick: this.tick + TRAP_RULES.immunityTicks } });
        }
      }
      if (p.life?.phase !== 'ALIVE') p.active = false;
    }
  }
  step(players: PhysicsPlayer[], controls: ReadonlyMap<string, PlayerControls>) {
    this.tick++; this.lifecycle(players);
    const impacts = stepPlayers(players, controls, this.solids, this.arena.width, this.arena.height, fanForces(players, this.placements));
    for (const placement of this.placements) {
      const trap = getTrap(placement.catalogId); if (trap?.activation.kind !== 'crossbow') continue;
      const params = trap.activation;
      if (this.tick % params.intervalTicks !== 0 || this.projectiles.length >= TRAP_RULES.maxProjectiles || this.projectiles.filter(p => p.sourceId === placement.id).length >= params.maxProjectiles) continue;
      const dir = orientationVector(trapOrientation(trap.id, placement.orientation)!);
      this.projectiles.push({ id: `${placement.id}:${++this.serial}`, sourceId: placement.id, x: placement.x + (dir.x > 0 ? placement.width + params.radius + 1 : -params.radius - 1), y: placement.y + placement.height / 2,
        velocityX: dir.x * params.speed, bornTick: this.tick, expiresTick: this.tick + params.ttlTicks, radius: params.radius });
    }
    this.projectiles = this.projectiles.filter(shot => {
      if (this.tick >= shot.expiresTick) return false;
      const next = { x: shot.x + shot.velocityX / PLAYER_PHYSICS.tickHz, y: shot.y };
      let nearest = Infinity; let victim: PhysicsPlayer | undefined;
      for (const solid of this.solids) { const at = segmentHit(shot, next, solid, shot.radius); if (at !== null && at < nearest) nearest = at; }
      for (const p of [...players].sort((a, b) => a.seat - b.seat)) {
        if (!p.active || p.finished || (p.life && (p.life.phase !== 'ALIVE' || this.tick < p.life.immuneUntilTick))) continue;
        const at = segmentHit(shot, next, playerBody(p), shot.radius);
        if (at !== null && at < nearest) { nearest = at; victim = p; }
      }
      if (Number.isFinite(nearest)) {
        if (victim) {
          victim.life = { phase: 'HIT', serial: (victim.life?.serial ?? 0) + 1, failures: (victim.life?.failures ?? 0) + 1, untilTick: this.tick + TRAP_RULES.hitTicks, immuneUntilTick: 0 };
          victim.active = false; victim.velocityX = 0; victim.velocityY = 0; victim.windX = 0; victim.grounded = false; victim.supportId = null;
          this.hits.push({ id: `hit:${shot.id}`, playerId: victim.playerId, x: victim.x, y: victim.y, tick: this.tick });
        }
        return false;
      }
      shot.x = next.x;
      return shot.x >= 0 && shot.x <= this.arena.width;
    });
    this.hits = this.hits.filter(h => this.tick - h.tick < 30).slice(-16);
    return impacts;
  }
  snapshot(): TrapSnapshot { return { tick: this.tick, projectiles: this.projectiles.map(p => ({ ...p })), hits: this.hits.map(h => ({ ...h })) }; }
}
