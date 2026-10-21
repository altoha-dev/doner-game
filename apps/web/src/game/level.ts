import type { Rect } from '@doner-game/shared';
import { PLAYER_PHYSICS, SNOWY_CHAOS } from '@doner-game/shared';
export { SNOWY_CHAOS } from '@doner-game/shared';

export interface ArenaTileRegion extends Rect { readonly material: 'snow-rock' | 'ice' }
// Visual choices can change without changing collision geometry or saved placements.
export const ARENA_VISUALS: readonly ArenaTileRegion[] = SNOWY_CHAOS.geometry.map((rect, i) => ({ ...rect, material: i === 2 || i === 4 ? 'ice' : 'snow-rock' }));
export const MOVEMENT = PLAYER_PHYSICS;
