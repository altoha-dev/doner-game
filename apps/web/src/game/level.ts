export interface PlatformDefinition { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface LevelDefinition {
  readonly id: string;
  readonly name: string;
  readonly availability: 'playable' | 'coming-soon';
  readonly width: number;
  readonly height: number;
  readonly spawn: { readonly x: number; readonly y: number };
  readonly goal: { readonly x: number; readonly y: number };
  readonly platforms: readonly PlatformDefinition[];
}

// Coordinates are logical pixels. All themes use exactly the same safe geometry.
export const LEVEL_ONE = {
  id: 'level-1', name: 'УРОВЕНЬ 1', availability: 'playable', width: 1200, height: 344,
  spawn: { x: 32, y: 280 }, goal: { x: 1144, y: 300 },
  platforms: [
    { x: 0, y: 300, width: 1200, height: 44 },
    { x: 120, y: 272, width: 56, height: 12 },
    { x: 208, y: 248, width: 64, height: 12 },
    { x: 344, y: 276, width: 48, height: 24 },
    { x: 464, y: 272, width: 64, height: 12 },
    { x: 556, y: 248, width: 72, height: 12 },
    { x: 660, y: 224, width: 56, height: 12 },
    { x: 792, y: 276, width: 48, height: 24 },
    { x: 900, y: 272, width: 64, height: 12 },
    { x: 996, y: 248, width: 56, height: 12 },
  ],
} as const satisfies LevelDefinition;

export const MOVEMENT = { speed: 100, acceleration: 800, drag: 1000, gravity: 660, jump: 224, coyoteMs: 80, bufferMs: 100 } as const;
