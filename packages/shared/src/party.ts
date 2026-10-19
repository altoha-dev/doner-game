import type { CharacterId } from './characters.js';

export type MatchPhase = 'LOBBY' | 'BUILD' | 'RACE' | 'RESULTS' | 'MATCH_FINISHED';
export interface Point { readonly x: number; readonly y: number }
export interface Rect extends Point { readonly width: number; readonly height: number }
export interface ArenaDefinition {
  readonly id: string; readonly revision: number; readonly name: string;
  readonly width: number; readonly height: number; readonly grid: number;
  readonly geometry: readonly Rect[];
  readonly spawns: readonly Point[];
  readonly finish: Rect;
  readonly placementAreas: readonly Rect[];
  readonly protectedAreas: readonly Rect[];
}
export interface TrapPlacement extends Rect {
  readonly id: string; readonly catalogId: 'basic-platform';
  readonly ownerId: string; readonly round: number;
}
export interface RoundResult { readonly round: number; readonly elapsedMs: number; readonly playerId: string }
export interface MatchSnapshot {
  readonly matchId: string; readonly arenaId: string; readonly arenaRevision: number;
  readonly revision: number; readonly phase: MatchPhase; readonly round: number;
  readonly placements: readonly TrapPlacement[]; readonly results: readonly RoundResult[];
}
// Transport-neutral boundary. The future server will own snapshots and validate commands.
export type ArenaCommand =
  | { type: 'PLACE'; position: Point }
  | { type: 'START_RACE' }
  | { type: 'FINISH_LOCAL'; elapsedMs: number }
  | { type: 'NEXT_ROUND' };
export interface ArenaSession {
  getSnapshot(): MatchSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: ArenaCommand): { ok: boolean; reason?: string };
}
export interface RoomPlayer {
  readonly playerId: string; readonly characterId: CharacterId;
  readonly presence: 'connected' | 'reconnecting' | 'disconnected'; readonly ready: boolean;
}
export interface RoomSnapshot {
  readonly roomId: string; readonly roomCode: string; readonly players: readonly RoomPlayer[];
  readonly match: MatchSnapshot | null;
}
// Proposed online contracts (not sent anywhere by Stage 6.0).
export interface RaceInput {
  readonly sequence: number; readonly clientTick: number;
  readonly direction: -1 | 0 | 1; readonly jumpPressed: boolean;
}
export interface RacePlayerState extends Point {
  readonly playerId: string; readonly velocityX: number; readonly velocityY: number;
  readonly lastProcessedInput: number; readonly finished: boolean;
}
export interface RaceSnapshot {
  readonly matchId: string; readonly round: number; readonly serverTick: number;
  readonly players: readonly RacePlayerState[]; readonly finishOrder: readonly string[];
}
export interface PlacementRequest {
  readonly commandId: string; readonly matchId: string; readonly round: number;
  readonly expectedRevision: number; readonly catalogId: string; readonly position: Point;
}
// No abilities are approved or implemented in 6.0; rendering/levels do not depend on these.
export interface CharacterAbilityDefinition {
  readonly id: string; readonly characterId: CharacterId;
  readonly activation: 'press' | 'hold'; readonly parameters: Readonly<Record<string, number>>;
}
export const PARTY_RULES = {
  freeObjectsPerRound: 1, maxPlacements: 12, localRoundLimit: 12,
  basicPlatform: { width: 32, height: 16 },
  donersByFinish: [0, 1, 2, 3],
  proposedPointsByFinish: [3, 2, 1, 0],
  unresolved: ['DNF', 'ties', 'disconnect'] as const,
} as const;
// A pure proposal for future settlement; never called by local training or an API reward route.
export function proposedFinishReward(position: number, points: readonly number[] = PARTY_RULES.proposedPointsByFinish) {
  if (!Number.isSafeInteger(position) || position < 1 || points.length !== 4) throw new Error('Invalid finish rule');
  const index = Math.min(position, 4) - 1;
  return { doners: PARTY_RULES.donersByFinish[index]!, points: points[index]! };
}
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
export function snapToGrid(point: Point, grid: number): Point {
  return { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };
}
export function placementError(arena: ArenaDefinition, placements: readonly TrapPlacement[], point: Point): string | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x % arena.grid || point.y % arena.grid) return 'Нужна позиция на сетке';
  if (placements.length >= PARTY_RULES.maxPlacements) return 'Достигнут лимит блоков';
  const block = { ...point, ...PARTY_RULES.basicPlatform };
  if (arena.protectedAreas.some(area => overlaps(area, block))) return 'Старт и финиш защищены';
  if (!arena.placementAreas.some(a => block.x >= a.x && block.y >= a.y && block.x + block.width <= a.x + a.width && block.y + block.height <= a.y + a.height)) return 'Вне зоны строительства';
  if ([...arena.geometry, ...placements].some(solid => overlaps(solid, block))) return 'Здесь уже есть платформа';
  return null;
}
