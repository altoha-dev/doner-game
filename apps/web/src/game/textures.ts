import Phaser from 'phaser';
import { CHARACTER_COLORS } from './playerVisual';
import type { CharacterId } from '@doner-game/shared';

// Original code-native pixel graphics. No downloaded packs or runtime image requests.
export function createWinterTextures(scene: Phaser.Scene, id: CharacterId, includePlayer = true) {
  const draw = (key: string, w: number, h: number, paint: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.make.graphics({ x: 0, y: 0 }); paint(g); g.generateTexture(key, w, h); g.destroy();
  };
  draw('snow-rock', 16, 16, g => {
    g.fillStyle(0x445c77).fillRect(0, 0, 16, 16); g.fillStyle(0x63829a).fillRect(1, 5, 8, 5).fillRect(10, 11, 5, 3);
    g.fillStyle(0xb8d8e7).fillRect(0, 2, 16, 3); g.fillStyle(0xf1f5e9).fillRect(0, 0, 16, 3).fillRect(2, 3, 3, 2);
    g.fillStyle(0x31495f).fillRect(0, 14, 16, 2).fillRect(9, 7, 3, 2);
  });
  draw('rock', 16, 16, g => { g.fillStyle(0x344b65).fillRect(0, 0, 16, 16); g.fillStyle(0x435e76).fillRect(2, 2, 10, 6).fillRect(7, 11, 9, 4); });
  draw('ice', 16, 16, g => {
    g.fillStyle(0x589db6).fillRect(0, 0, 16, 16); g.fillStyle(0xc9eef0).fillRect(0, 0, 16, 3);
    g.fillStyle(0x9ad6df).fillRect(3, 4, 3, 7).fillRect(6, 3, 3, 4); g.fillStyle(0x366e92).fillRect(0, 14, 16, 2);
  });
  draw('built-block', 32, 16, g => {
    g.fillStyle(0x885c42).fillRect(0, 0, 32, 16); g.fillStyle(0xc69567).fillRect(1, 3, 30, 10);
    g.fillStyle(0x815538).fillRect(14, 4, 2, 10).fillRect(0, 13, 32, 3);
    g.fillStyle(0xeaf5ec).fillRect(0, 0, 32, 3); g.fillStyle(0xffc780).fillRect(3, 5, 3, 3).fillRect(25, 5, 3, 3);
  });
  draw('pine', 32, 56, g => {
    g.fillStyle(0x735a50).fillRect(14, 42, 5, 14);
    for (let i = 0; i < 3; i++) {
      const x = 10 - i * 4, y = 4 + i * 12, w = 12 + i * 8;
      g.fillStyle(0x2a6270).fillRect(x, y + 4, w, 12); g.fillStyle(0xbcd9dd).fillRect(x, y + 4, w, 3).fillRect(x + 4, y, w - 8, 4);
    }
  });
  draw('lamp', 16, 48, g => {
    g.fillStyle(0x273c56).fillRect(7, 12, 3, 36).fillRect(3, 46, 11, 2);
    g.fillStyle(0x4d647b).fillRect(2, 4, 13, 15); g.fillStyle(0xffc571).fillRect(4, 6, 9, 10);
    g.fillStyle(0xffe7ac).fillRect(5, 7, 3, 6); g.fillStyle(0xe3f1ed).fillRect(0, 2, 16, 3);
  });
  draw('snowman', 24, 32, g => {
    g.fillStyle(0xd5e9ec).fillRect(3, 16, 18, 14).fillRect(6, 6, 12, 12);
    g.fillStyle(0xffa252).fillRect(10, 17, 12, 3).fillRect(15, 12, 7, 2);
    g.fillStyle(0x233c57).fillRect(8, 10, 2, 2).fillRect(14, 10, 2, 2).fillRect(11, 23, 2, 2).fillRect(4, 5, 16, 3).fillRect(7, 0, 10, 6);
  });
  if (!includePlayer) return;
  draw(`winter-player-${id}`, 64, 24, g => {
    const colors = CHARACTER_COLORS[id];
    for (let i = 0; i < 4; i++) {
      const x = i * 16, leg = i === 1 ? 1 : i === 2 ? -1 : 0;
      g.fillStyle(0x182b45).fillRect(x + 3, 3, 10, 20);
      g.fillStyle(colors.coat).fillRect(x + 3, 12, 10, 8).fillRect(x + 3, 3, 10, 4).fillRect(x + 5, 1, 6, 3);
      g.fillStyle(0xf4cb9e).fillRect(x + 4, 7, 8, 6); g.fillStyle(0x20364e).fillRect(x + 9, 8, 2, 2);
      g.fillStyle(colors.scarf).fillRect(x + 2, 12, 12, 2).fillRect(x + 1, 13, 3, 5);
      g.fillStyle(0x24364d).fillRect(x + 3 + leg, 20, 4, 4).fillRect(x + 9 - leg, 20, 4, 4);
      g.fillStyle(0xeaf4eb).fillRect(x + 3 + leg, 23, 4, 1).fillRect(x + 9 - leg, 23, 4, 1);
    }
  });
  const texture = scene.textures.get(`winter-player-${id}`);
  for (let frame = 0; frame < 4; frame++) texture.add(frame, 0, frame * 16, 0, 16, 24);
}
