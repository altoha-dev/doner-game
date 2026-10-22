import { DONER_RULES } from './economy.js';
import type { Point, Rect, TrapPlacement } from './party.js';

export type TrapId = 'basic-platform' | 'fan' | 'arcade-crossbow';
export type Orientation = 'none' | 'up' | 'left' | 'right';
export interface TrapDefinition {
  readonly id: TrapId; readonly displayName: string; readonly description: string;
  readonly category: 'platform' | 'air' | 'projectile'; readonly dimensions: { width: number; height: number };
  readonly collision: 'solid'; readonly orientations: readonly Orientation[];
  readonly restrictions: { grid: true; protectedZones: true; overlap: false };
  readonly visual: string; readonly donerPrice: number;
  readonly activation: { kind: 'none' } | { kind: 'fan'; range: number; force: number; maxWind: number; lift: number } |
    { kind: 'crossbow'; intervalTicks: number; warningTicks: number; speed: number; ttlTicks: number; maxProjectiles: number; radius: number };
}
const base = { dimensions: { width: 32, height: 16 }, collision: 'solid', restrictions: { grid: true, protectedZones: true, overlap: false } } as const;
export const TRAPS: readonly TrapDefinition[] = [
  { ...base, id: 'basic-platform', displayName: 'PLATFORM BLOCK', description: 'Твёрдая платформа для прыжков.', category: 'platform', orientations: ['none'], visual: 'built-block', donerPrice: DONER_RULES.prices['basic-platform'], activation: { kind: 'none' } },
  { ...base, id: 'fan', displayName: 'FAN', description: 'Поток воздуха поднимает или сдвигает игроков.', category: 'air', orientations: ['up', 'right', 'left'], visual: 'trap-fan', donerPrice: DONER_RULES.prices.fan, activation: { kind: 'fan', range: 96, force: 360, maxWind: 70, lift: 900 } },
  { ...base, id: 'arcade-crossbow', displayName: 'ARCADE CROSSBOW', description: 'Предупреждает, затем выпускает снежный болт. Попадание возвращает на старт.', category: 'projectile', orientations: ['right', 'left'], visual: 'trap-crossbow', donerPrice: DONER_RULES.prices['arcade-crossbow'], activation: { kind: 'crossbow', intervalTicks: 120, warningTicks: 24, speed: 180, ttlTicks: 180, maxProjectiles: 2, radius: 2 } },
];
export const TRAP_TEST_LOADOUT: readonly TrapId[] = TRAPS.map(t => t.id);
export const TRAP_RULES = { maxProjectiles: 32, hitTicks: 8, respawnTicks: 24, immunityTicks: 60 } as const;
export function getTrap(id: unknown) { return TRAPS.find(t => t.id === id); }
export function trapOrientation(id: unknown, orientation?: unknown): Orientation | null {
  const trap = getTrap(id); if (!trap) return null;
  const value = orientation ?? trap.orientations[0];
  return trap.orientations.includes(value as Orientation) ? value as Orientation : null;
}
export const orientationVector = (orientation: Orientation): Point => orientation === 'up' ? { x: 0, y: -1 } : { x: orientation === 'left' ? -1 : 1, y: 0 };
export function trapZone(placement: TrapPlacement): Rect | null {
  const trap = getTrap(placement.catalogId)!; const a = trap.activation;
  if (a.kind === 'none') return null;
  const direction = trapOrientation(trap.id, placement.orientation)!;
  const range = a.kind === 'fan' ? a.range : a.speed * a.ttlTicks / 60;
  if (direction === 'up') return { x: placement.x, y: placement.y - range, width: placement.width, height: range };
  return { x: direction === 'left' ? placement.x - range : placement.x + placement.width, y: placement.y - (a.kind === 'fan' ? 8 : 0), width: range, height: a.kind === 'fan' ? 32 : placement.height };
}
export interface PlayerLife { phase: 'ALIVE' | 'HIT' | 'RESPAWNING'; serial: number; failures: number; untilTick: number; immuneUntilTick: number }
export interface Projectile { id: string; sourceId: string; x: number; y: number; velocityX: number; bornTick: number; expiresTick: number; radius: number }
export interface TrapHit { id: string; playerId: string; x: number; y: number; tick: number }
export interface TrapSnapshot { tick: number; projectiles: Projectile[]; hits: TrapHit[] }
