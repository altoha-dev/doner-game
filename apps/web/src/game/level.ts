import type { Rect } from '@doner-game/shared';
import { SNOWY_CHAOS } from '@doner-game/shared';
export { SNOWY_CHAOS } from '@doner-game/shared';

export interface ArenaTileRegion extends Rect { readonly material: 'snow-rock' | 'ice' }
// Visual choices can change without changing collision geometry or saved placements.
export const ARENA_VISUALS: readonly ArenaTileRegion[] = SNOWY_CHAOS.geometry.map((rect, i) => ({ ...rect, material: i === 2 || i === 4 ? 'ice' : 'snow-rock' }));
export const MOVEMENT = { speed: 100, acceleration: 800, drag: 1000, gravity: 660, jump: 224, coyoteMs: 80, bufferMs: 100 } as const;
