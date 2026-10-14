import type Phaser from 'phaser';
import type { WorldTheme } from '@doner-game/shared';

type Paint = (context: CanvasRenderingContext2D) => void;
type Palette = WorldTheme['palette'];
const rect = (c: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) => {
  c.fillStyle = color; c.fillRect(x, y, w, h);
};

function texture(scene: Phaser.Scene, key: string, width: number, height: number, paint: Paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D unavailable');
  context.imageSmoothingEnabled = false;
  paint(context);
  const result = scene.textures.addCanvas(key, canvas);
  if (!result) throw new Error('Texture creation failed');
  return result;
}

// Original, deterministic shapes. All art generation is confined to this module.
const backgrounds: Record<WorldTheme['backgroundStyle'], (c: CanvasRenderingContext2D, p: Palette, near: boolean) => void> = {
  city(c, p, near) {
    for (let i = 0; i < 8; i++) {
      const x = i * 36 - 8, h = near ? 38 + (i * 13) % 35 : 70 + (i * 29) % 85;
      rect(c, near ? p.middle : p.distant, x, 512 - h, 28, h);
      rect(c, near ? p.middle : p.distant, x + 8, 506 - h, 12, 6);
      for (let y = 520 - h; y < 500; y += 14) {
        rect(c, near ? p.edge : p.middle, x + 5, y, 3, 4);
        if (i % 2 === 0) rect(c, near ? p.secondary : p.middle, x + 17, y, 3, 4);
      }
      if (near && i % 3 === 0) { rect(c, p.shadow, x + 2, 482, 23, 9); rect(c, p.accent, x + 5, 485, 15, 2); }
    }
  },
  imperial(c, p, near) {
    const top = near ? 440 : 385, color = near ? p.middle : p.distant;
    for (let x = -8; x < 256; x += 64) {
      rect(c, color, x, top, 60, 9);
      rect(c, color, x + 6, top - 6, 48, 6);
      rect(c, color, x + 8, top + 9, 12, 125);
      rect(c, color, x + 44, top + 9, 12, 125);
      rect(c, color, x + 18, top + 9, 28, 8);
      rect(c, color, x + 20, top + 17, 6, 8);
      rect(c, color, x + 38, top + 17, 6, 8);
      if (near) {
        rect(c, p.edge, x + 10, top + 12, 2, 49);
        rect(c, p.secondary, x + 28, top + 21, 10, 27);
        rect(c, p.accent, x + 28, top + 21, 10, 2);
        rect(c, p.accent, x + 32, top + 29, 2, 9);
      }
    }
  },
  bazaar(c, p, near) {
    for (let i = 0; i < 5; i++) {
      const x = i * 58 - 14, h = near ? 54 + (i % 2) * 12 : 86 + (i * 19) % 60;
      const color = near ? p.middle : p.distant;
      rect(c, color, x, 512 - h, 48, h);
      rect(c, color, x + 6, 506 - h, 36, 6);
      rect(c, color, x + 12, 500 - h, 24, 6);
      rect(c, near ? p.shadow : p.middle, x + 17, 524 - h, 14, 28);
      rect(c, color, x + 17, 524 - h, 3, 4);
      rect(c, color, x + 28, 524 - h, 3, 4);
      if (near) {
        rect(c, p.shadow, x + 2, 487, 44, 4);
        for (let stripe = 0; stripe < 6; stripe++) rect(c, stripe % 2 ? p.edge : p.secondary, x + 3 + stripe * 7, 479, 7, 10);
        rect(c, p.edge, x + 4, 489, 2, 23); rect(c, p.edge, x + 43, 489, 2, 23);
      }
    }
  },
};

const tiles: Record<WorldTheme['platformStyle'], (c: CanvasRenderingContext2D, p: Palette) => void> = {
  metal(c, p) {
    rect(c, p.shadow, 0, 15, 32, 1); rect(c, p.shadow, 31, 0, 1, 32);
    rect(c, p.edge, 3, 5, 2, 2); rect(c, p.edge, 27, 5, 2, 2);
    rect(c, p.middle, 8, 9, 17, 3); rect(c, p.accent, 0, 0, 8, 2);
  },
  stone(c, p) {
    rect(c, p.shadow, 0, 14, 32, 2); rect(c, p.shadow, 23, 3, 1, 12);
    rect(c, p.shadow, 9, 16, 1, 16); rect(c, p.edge, 3, 6, 8, 1);
    rect(c, p.middle, 15, 22, 10, 2);
  },
  sandstone(c, p) {
    rect(c, p.shadow, 0, 15, 32, 1); rect(c, p.shadow, 21, 3, 1, 12);
    rect(c, p.shadow, 8, 16, 1, 16);
    for (let i = 0; i < 9; i++) rect(c, p.edge, (i * 13) % 32, 5 + (i * 7) % 26, 1, 1);
  },
};

const decorations: Record<WorldTheme['decorStyle'], (c: CanvasRenderingContext2D, p: Palette) => void> = {
  signs(c, p) {
    rect(c, p.edge, 14, 13, 3, 35); rect(c, p.shadow, 1, 2, 30, 19);
    rect(c, p.secondary, 3, 4, 26, 15); rect(c, p.shadow, 5, 6, 22, 11);
    rect(c, p.accent, 8, 9, 12, 2); rect(c, p.accent, 18, 11, 5, 2);
  },
  banners(c, p) {
    rect(c, p.edge, 4, 2, 3, 46); rect(c, p.accent, 4, 2, 23, 3);
    rect(c, p.secondary, 10, 5, 16, 28); rect(c, p.secondary, 13, 33, 10, 4);
    rect(c, p.accent, 17, 12, 2, 14); rect(c, p.accent, 13, 16, 10, 2);
  },
  awnings(c, p) {
    rect(c, p.shadow, 2, 18, 2, 30); rect(c, p.shadow, 28, 18, 2, 30);
    for (let i = 0; i < 5; i++) rect(c, i % 2 ? p.light : p.secondary, 1 + i * 6, 13, 6, 10);
    rect(c, p.edge, 1, 12, 30, 2); rect(c, p.surface, 7, 37, 17, 11);
    rect(c, p.accent, 10, 33, 6, 4); rect(c, p.secondary, 19, 35, 4, 2);
  },
};

export function createPrototypeTextures(scene: Phaser.Scene, theme: WorldTheme) {
  const p = theme.palette;
  texture(scene, 'far', 256, 512, c => {
    rect(c, p.sky, 0, 0, 256, 512);
    rect(c, p.light, 189, 345, 18, 18);
    rect(c, p.sky, 189, 345, 4, 4); rect(c, p.sky, 203, 359, 4, 4);
    if (theme.backgroundStyle !== 'bazaar') {
      for (let i = 0; i < 18; i++) rect(c, p.middle, (i * 47) % 256, 290 + (i * 17) % 160, 1, 1);
    }
    backgrounds[theme.backgroundStyle](c, p, false);
  });
  texture(scene, 'middle', 256, 512, c => backgrounds[theme.backgroundStyle](c, p, true));
  texture(scene, 'platform', 32, 32, c => {
    rect(c, p.surface, 0, 0, 32, 32); rect(c, p.edge, 0, 0, 32, 3);
    tiles[theme.platformStyle](c, p);
  });
  texture(scene, 'decor', 32, 48, c => decorations[theme.decorStyle](c, p));
  texture(scene, 'goal', 24, 48, c => {
    rect(c, p.shadow, 1, 2, 4, 46); rect(c, p.light, 2, 2, 2, 46);
    rect(c, p.accent, 4, 3, 19, 16); rect(c, p.light, 7, 6, 3, 3);
    rect(c, p.light, 13, 6, 3, 3); rect(c, p.light, 10, 9, 3, 3);
    rect(c, p.light, 16, 9, 3, 3); rect(c, p.light, 7, 12, 3, 3);
    rect(c, p.light, 13, 12, 3, 3);
  });
  const sheet = texture(scene, 'player', 64, 24, c => {
    const a = theme.player;
    for (let frame = 0; frame < 4; frame++) {
      c.save(); c.translate(frame * 16, 0);
      const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
      rect(c, p.shadow, 4, 1, 9, 21);
      rect(c, a.hair, 4, 1, 9, 7); rect(c, a.skin, 5, 5, 8, 6);
      rect(c, a.hair, 4, 3, 9, 3); rect(c, p.shadow, 11, 7, 1, 2);
      rect(c, a.outfit, 4, 11, 9, 7); rect(c, a.trim, 4, 11, 9, 2);
      rect(c, a.skin, 2, frame === 3 ? 8 : 13 + step, 2, 4);
      rect(c, a.skin, 13, frame === 3 ? 8 : 13 - step, 2, 4);
      rect(c, a.trousers, 5, 18, 3, 4 + step); rect(c, a.trousers, 10, 18, 3, 4 - step);
      rect(c, p.shadow, 4, 21 + step, 4, 2); rect(c, p.shadow, 10, 21 - step, 4, 2);
      // Silhouette details, independent of the common collision body.
      if (theme.characterId === 'altoha') rect(c, a.trim, 3, 4, 3, 3);
      if (theme.characterId === 'aigerim') { rect(c, a.trim, 4, 2, 9, 2); rect(c, a.hair, 3, 6, 2, 7); }
      if (theme.characterId === 'temik') { rect(c, a.outfit, 3, 1, 11, 3); rect(c, a.trim, 1, 12, 3, 3); }
      c.restore();
    }
  });
  for (let i = 0; i < 4; i++) sheet.add(i, 0, i * 16, 0, 16, 24);
}
