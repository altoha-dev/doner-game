import { overlaps } from './party.js';
import type { Rect } from './party.js';

/** Logical pixels / seconds. Identical for all characters. Training shares movement constants. */
export const PLAYER_PHYSICS = {
  width: 10, height: 21, speed: 100, acceleration: 800, drag: 1000,
  gravity: 660, jump: 224, maxFall: 420, coyoteMs: 80, bufferMs: 100,
  pushSpeed: 36, pushShare: .75, headJumpBonus: 12, tolerance: .001, headTolerance: 2, solverPasses: 24,
  tickHz: 60, snapshotHz: 15, inputHz: 20, inputTimeoutMs: 300,
  maxCatchupSteps: 6, maxPredictionSteps: 12, interpolationMs: 1000 / 15,
  correctionSnapDistance: 32, correctionDecay: .65, impactCooldownMs: 220,
} as const;

export interface PlayerControls { sequence: number; direction: -1 | 0 | 1; jump: number }
export interface PhysicsPlayer {
  playerId: string; seat: number; x: number; y: number; velocityX: number; velocityY: number;
  grounded: boolean; supportId: string | null; coyoteTicks: number; jumpBufferTicks: number;
  sequence: number; jumpSerial: number; direction: -1 | 0 | 1; active: boolean; finished: boolean;
}
export interface PlayerImpact { kind: 'push' | 'head' | 'head-jump'; a: string; b: string; x: number; y: number }
export function createPhysicsPlayer(playerId: string, seat: number, x: number, y: number): PhysicsPlayer {
  return { playerId, seat, x, y, velocityX: 0, velocityY: 0, grounded: false, supportId: null,
    coyoteTicks: 0, jumpBufferTicks: 0, sequence: 0, jumpSerial: 0, direction: 0, active: true, finished: false };
}
const cfg = PLAYER_PHYSICS, dt = 1 / cfg.tickHz, half = cfg.width / 2, eps = cfg.tolerance;
const toward = (value: number, target: number, amount: number) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
export function playerBody(player: Pick<PhysicsPlayer, 'x' | 'y'>): Rect {
  return { x: player.x - half, y: player.y - cfg.height, width: cfg.width, height: cfg.height };
}
function free(x: number, y: number, solids: readonly Rect[], width: number, height: number) {
  return x >= half - eps && x <= width - half + eps && y >= cfg.height - eps && y <= height + eps &&
    !solids.some(s => overlaps({ x: x - half + eps, y: y - cfg.height + eps, width: cfg.width - 2 * eps, height: cfg.height - 2 * eps }, s));
}
function moveX(p: PhysicsPlayer, delta: number, solids: readonly Rect[], width: number) {
  const old = p.x;
  let next = Math.max(half, Math.min(width - half, old + delta));
  for (const s of solids) {
    if (p.y <= s.y + eps || p.y - cfg.height >= s.y + s.height - eps) continue;
    if (delta > 0 && old + half <= s.x + eps && next + half > s.x) next = Math.min(next, s.x - half);
    if (delta < 0 && old - half >= s.x + s.width - eps && next - half < s.x + s.width) next = Math.max(next, s.x + s.width + half);
  }
  p.x = next; return next - old;
}
function moveY(p: PhysicsPlayer, delta: number, solids: readonly Rect[], height: number) {
  const old = p.y;
  let next = Math.max(cfg.height, Math.min(height, old + delta));
  for (const s of solids) {
    if (p.x + half <= s.x + eps || p.x - half >= s.x + s.width - eps) continue;
    if (delta >= 0 && old <= s.y + eps && next >= s.y) { next = Math.min(next, s.y); p.grounded = true; }
    if (delta < 0 && old - cfg.height >= s.y + s.height - eps && next - cfg.height < s.y + s.height) next = Math.max(next, s.y + s.height + cfg.height);
  }
  p.y = next;
  if (Math.abs(next - old - delta) > eps || p.grounded) p.velocityY = 0;
}

/** Mutates only the supplied players. No clock, randomness, IO, Phaser, or character-specific rules. */
export function stepPlayers(players: PhysicsPlayer[], controls: ReadonlyMap<string, PlayerControls>, solids: readonly Rect[], width: number, height: number): PlayerImpact[] {
  const ordered = [...players].sort((a, b) => a.seat - b.seat || (a.playerId < b.playerId ? -1 : 1));
  const before = new Map(ordered.map(p => [p.playerId, { ...p }]));
  const jumped = new Set<string>(), impacts: PlayerImpact[] = [];
  for (const p of ordered) {
    if (p.finished) continue;
    const input = p.active ? controls.get(p.playerId) : undefined;
    p.direction = input?.direction ?? 0;
    if (input && input.sequence >= p.sequence) {
      p.sequence = input.sequence;
      if (input.jump > p.jumpSerial) { p.jumpBufferTicks = Math.ceil(cfg.bufferMs * cfg.tickHz / 1000); p.jumpSerial = input.jump; }
    }
    p.coyoteTicks = p.grounded ? Math.ceil(cfg.coyoteMs * cfg.tickHz / 1000) : Math.max(0, p.coyoteTicks - 1);
    if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0 && p.active) {
      p.velocityY = -cfg.jump - (p.supportId ? cfg.headJumpBonus : 0);
      if (p.supportId) impacts.push({ kind: 'head-jump', a: p.playerId, b: p.supportId, x: p.x, y: p.y });
      p.jumpBufferTicks = 0; p.coyoteTicks = 0; jumped.add(p.playerId);
    } else p.jumpBufferTicks = Math.max(0, p.jumpBufferTicks - 1);
    p.grounded = false; p.supportId = null;
    p.velocityX = toward(p.velocityX, p.direction * cfg.speed, (p.direction ? cfg.acceleration : cfg.drag) * dt);
    const dx = p.velocityX * dt;
    if (Math.abs(moveX(p, dx, solids, width) - dx) > eps) p.velocityX = 0;
    p.velocityY = Math.min(cfg.maxFall, p.velocityY + cfg.gravity * dt);
    moveY(p, p.velocityY * dt, solids, height);
  }
  // A standing passenger follows a moving support, subject to world collisions.
  for (const p of ordered) {
    const previous = before.get(p.playerId)!;
    if (!previous.supportId || jumped.has(p.playerId) || !p.active || p.finished) continue;
    const support = ordered.find(s => s.playerId === previous.supportId && s.active && !s.finished);
    const oldSupport = support && before.get(support.playerId)!;
    if (support && oldSupport) {
      moveX(p, support.x - oldSupport.x, solids, width);
      const y = p.y + support.y - oldSupport.y;
      if (free(p.x, y, solids, width, height)) p.y = y;
    }
  }
  // Bounded iterative solver handles stacks/chains of up to four players in stable seat order.
  for (let pass = 0; pass < cfg.solverPasses; pass++) {
    let contact = false;
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!, b = ordered[j]!;
      if (!a.active || !b.active || a.finished || b.finished) continue;
      const horizontal = cfg.width - Math.abs(a.x - b.x);
      const vertical = Math.min(a.y, b.y) - Math.max(a.y - cfg.height, b.y - cfg.height);
      if (horizontal <= eps || vertical <= eps) continue;
      contact = true;
      const oldA = before.get(a.playerId)!, oldB = before.get(b.playerId)!;
      const upper = oldA.y <= oldB.y - cfg.height + cfg.headTolerance ? a : oldB.y <= oldA.y - cfg.height + cfg.headTolerance ? b : null;
      if (upper) {
        const lower = upper === a ? b : a, target = lower.y - cfg.height;
        if (free(upper.x, target, solids, width, height)) {
          upper.y = target; upper.velocityY = lower.velocityY; upper.grounded = true; upper.supportId = lower.playerId;
          if (pass === 0 && before.get(upper.playerId)!.supportId !== lower.playerId) impacts.push({ kind: 'head', a: upper.playerId, b: lower.playerId, x: upper.x, y: upper.y });
          continue;
        }
        // A stack cannot be driven into a ceiling: stop the lower player's ascent.
        const lowerY = upper.y + cfg.height;
        if (free(lower.x, lowerY, solids, width, height)) { lower.y = lowerY; lower.velocityY = Math.max(0, lower.velocityY); continue; }
      }
      const left = a.x < b.x || (a.x === b.x && a.seat < b.seat) ? a : b, right = left === a ? b : a;
      const leftPushes = left.direction > 0 && right.direction >= 0;
      const rightPushes = right.direction < 0 && left.direction <= 0;
      let rightShare = horizontal / 2;
      if (leftPushes) {
        const travelled = Math.max(0, right.x - before.get(right.playerId)!.x);
        rightShare = Math.min(horizontal * cfg.pushShare, Math.max(0, cfg.pushSpeed * dt - travelled));
      } else if (rightPushes) {
        const travelled = Math.max(0, before.get(left.playerId)!.x - left.x);
        rightShare = horizontal - Math.min(horizontal * cfg.pushShare, Math.max(0, cfg.pushSpeed * dt - travelled));
      }
      const rightMoved = moveX(right, rightShare, solids, width);
      const leftMoved = -moveX(left, -(horizontal - rightMoved), solids, width);
      const remainder = horizontal - rightMoved - leftMoved;
      if (remainder > eps) moveX(right, remainder, solids, width);
      if (pass === 0 && (leftPushes || rightPushes)) impacts.push({ kind: 'push', a: leftPushes ? left.playerId : right.playerId, b: leftPushes ? right.playerId : left.playerId, x: (left.x + right.x) / 2, y: Math.min(left.y, right.y) - cfg.height / 2 });
      if (leftPushes) { right.velocityX = Math.max(right.velocityX, Math.min(cfg.pushSpeed, rightMoved / dt)); left.velocityX = Math.min(left.velocityX, Math.max(0, (left.x - before.get(left.playerId)!.x) / dt)); }
      else if (rightPushes) { left.velocityX = Math.min(left.velocityX, -Math.min(cfg.pushSpeed, leftMoved / dt)); right.velocityX = Math.max(right.velocityX, Math.min(0, (right.x - before.get(right.playerId)!.x) / dt)); }
      else { left.velocityX = Math.min(0, left.velocityX); right.velocityX = Math.max(0, right.velocityX); }
    }
    if (!contact) break;
  }
  return impacts;
}
