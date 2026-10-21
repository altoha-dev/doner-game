import { createPhysicsPlayer, overlaps, playerBody, SNOWY_CHAOS } from '@doner-game/shared';
import type { Movement, NetworkPlayer, Rect } from '@doner-game/shared';

export interface MovementHistory { state: NetworkPlayer; acceptedAt: number; raceStart: number; distance: number; groundY: number; airSince: number | null }
export function initialMovement(playerId: string, seat: number, round: number, now: number): MovementHistory {
  const spawn = SNOWY_CHAOS.spawns[seat] ?? SNOWY_CHAOS.spawns[0]!;
  return { state: { ...createPhysicsPlayer(playerId, seat, spawn.x, spawn.y), round }, acceptedAt: now, raceStart: now, distance: 0, groundY: spawn.y, airSince: null };
}
export function validateMovement(history: MovementHistory, move: Movement, solids: readonly Rect[], now: number): boolean {
  const previous = history.state;
  if (previous.finished || move.round !== previous.round || move.sequence <= previous.sequence) return false;
  if (move.x < 5 || move.x > SNOWY_CHAOS.width - 5 || move.y < 21 || move.y > SNOWY_CHAOS.height) return false;
  if (Math.abs(move.velocityX) > 101 || move.velocityY < -225 || move.velocityY > 421) return false;
  const dt = Math.min((now - history.acceptedAt) / 1000, .3);
  const dx = Math.abs(move.x - previous.x), dy = Math.abs(move.y - previous.y);
  // Short jitter allowance + cumulative travel budget. No client-supplied timestamp controls time.
  if (dx > 110 * dt + 8 || dy > 425 * dt + 8) return false;
  if (history.distance + dx > 110 * ((now - history.raceStart) / 1000) + 24) return false;
  // Sweep a slightly inset physical body: reject walls/ceilings/floors rather than teleport through them.
  const steps = Math.max(1, Math.ceil(Math.max(dx, dy) / 3));
  for (let i = 1; i <= steps; i++) {
    const x = previous.x + (move.x - previous.x) * i / steps;
    const y = previous.y + (move.y - previous.y) * i / steps;
    if (solids.some(s => overlaps({ x: x - 4, y: y - 20, width: 8, height: 19 }, s))) return false;
  }
  // A complete landing + buffered jump can occur between two 15 Hz packets.
  // Infer that contact only when the previous downward arc could reach a real surface.
  const bouncedOn = previous.velocityY >= -1 && move.velocityY < -1 ? solids.find(s =>
    s.y >= previous.y - 2 && s.y - previous.y <= Math.max(0, previous.velocityY) * dt + 330 * dt * dt + 5 &&
    Math.max(previous.x, move.x) + 5 > s.x && Math.min(previous.x, move.x) - 5 < s.x + s.width) : undefined;
  const groundY = bouncedOn?.y ?? history.groundY;
  const airSince = bouncedOn ? now : history.airSince;
  const support = solids.some(s => Math.abs(move.y - s.y) < 2 && move.x + 5 > s.x && move.x - 5 < s.x + s.width);
  if (!support && (move.y < groundY - 45 || (airSince !== null && now - airSince > 1400))) return false;
  history.groundY = groundY; history.airSince = airSince;
  history.distance += dx; history.acceptedAt = now;
  if (support) { history.groundY = move.y; history.airSince = null; } else history.airSince ??= now;
  history.state = { ...previous, ...move, finished: false };
  return true;
}
export function atFinish(move: Movement): boolean {
  return overlaps(playerBody(move), SNOWY_CHAOS.finish);
}
