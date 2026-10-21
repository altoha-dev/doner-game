import type { CharacterId } from '@doner-game/shared';
import { PLAYER_PHYSICS } from '@doner-game/shared';

// Replace this descriptor with an external spritesheet; body and arena stay stable.
export interface PlayerVisual {
  texture: string;
  sheet?: { url: string; frameWidth: number; frameHeight: number };
  origin: { x: number; y: number };
  body: { width: number; height: number; offsetX: number; offsetY: number };
  idle: readonly number[]; run: readonly number[]; air: readonly number[];
}
export const CHARACTER_COLORS: Record<CharacterId, { coat: number; scarf: number }> = {
  altoha: { coat: 0xf79545, scarf: 0xf9da83 },
  aigerim: { coat: 0xab92e8, scarf: 0xf4c8e0 },
  temik: { coat: 0x67c8ba, scarf: 0xecbb6c },
  ayazhan: { coat: 0x7962b5, scarf: 0x99e6f3 },
};
export function getPlayerVisual(id: CharacterId): PlayerVisual {
  return { texture: `winter-player-${id}`, origin: { x: .5, y: 1 }, body: { width: PLAYER_PHYSICS.width, height: PLAYER_PHYSICS.height, offsetX: 3, offsetY: 3 }, idle: [0], run: [1, 2], air: [3] };
}
export function playerFrame(visual: PlayerVisual, grounded: boolean, speed: number, time: number): number {
  const frames = !grounded ? visual.air : Math.abs(speed) > 5 ? visual.run : visual.idle;
  return frames[Math.floor(time / 120) % frames.length]!;
}
