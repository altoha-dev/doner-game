import type { ArenaDefinition } from './party.js';

// One definition for every character and every participant in a match.
export const SNOWY_CHAOS: ArenaDefinition = {
  id: 'snowy-chaos', revision: 1, name: 'SNOWY CHAOS', width: 1152, height: 320, grid: 16,
  geometry: [
    { x: 0, y: 272, width: 1152, height: 48 },
    { x: 256, y: 240, width: 64, height: 32 },
    { x: 448, y: 240, width: 48, height: 16 },
    { x: 608, y: 240, width: 80, height: 32 },
    { x: 800, y: 240, width: 48, height: 16 },
    { x: 912, y: 240, width: 48, height: 32 },
  ],
  spawns: [{ x: 48, y: 272 }, { x: 64, y: 272 }, { x: 80, y: 272 }, { x: 96, y: 272 }],
  finish: { x: 1072, y: 224, width: 32, height: 48 },
  placementAreas: [{ x: 0, y: 176, width: 1152, height: 96 }],
  protectedAreas: [{ x: 0, y: 0, width: 128, height: 320 }, { x: 1024, y: 0, width: 128, height: 320 }],
};
