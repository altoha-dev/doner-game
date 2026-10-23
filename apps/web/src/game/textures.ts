import Phaser from 'phaser';
import { trapPixels } from './winterArt';
import { CHARACTER_COLORS } from './playerVisual';
import type { CharacterId } from '@doner-game/shared';

// Original code-native pixel graphics. No downloaded packs or runtime image requests.
export function createWinterTextures(scene: Phaser.Scene, id: CharacterId, includePlayer = true) {
  const draw = (key: string, w: number, h: number, paint: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }); paint(g); g.generateTexture(key, w, h); g.destroy();
  };
  draw('snow-rock', 16, 16, g => {
    g.fillStyle(0x30475d).fillRect(0,0,16,16); g.fillStyle(0x48677b).fillRect(1,5,9,5).fillRect(5,11,10,4);
    g.fillStyle(0x638197).fillRect(1,5,8,1).fillRect(5,11,9,1); g.fillStyle(0x243b51).fillRect(11,7,5,2).fillRect(0,14,4,2);
    g.fillStyle(0x8fb8c9).fillRect(0,2,16,3); g.fillStyle(0xeaf4e8).fillRect(0,0,16,2).fillRect(2,2,4,2).fillRect(12,2,2,1);
    g.fillStyle(0xb4d9e1).fillRect(3,4,1,3).fillRect(14,4,1,2);
  });
  draw('rock',16,16,g=>{ g.fillStyle(0x2a4056).fillRect(0,0,16,16); g.fillStyle(0x3a566b).fillRect(1,1,10,6).fillRect(5,9,10,6); g.fillStyle(0x48677b).fillRect(2,1,8,1).fillRect(6,9,8,1); g.fillStyle(0x20364a).fillRect(12,1,1,7).fillRect(3,9,1,7); });
  draw('ice',16,16,g=>{
    g.fillStyle(0x396a86).fillRect(0,0,16,16); g.fillStyle(0x69a5bb).fillRect(1,3,14,11);
    g.fillStyle(0x96d0db).fillRect(2,4,3,7).fillRect(5,3,2,4).fillRect(11,8,2,5);
    g.fillStyle(0xc2e7e7).fillRect(3,4,1,5).fillRect(12,9,1,3); g.fillStyle(0xeaf4e8).fillRect(0,0,16,2).fillRect(9,2,5,1);
    g.fillStyle(0x274f6b).fillRect(0,14,16,2); g.fillStyle(0x90c3d3).fillRect(6,13,3,1);
  });
  draw('built-block',32,16,g=>{ for(const p of trapPixels('basic-platform')) g.fillStyle(p.color).fillRect(p.x,p.y,p.w,p.h); });
  draw('pine', 32, 56, g => {
    g.fillStyle(0x574e50).fillRect(14, 42, 5, 14); g.fillStyle(0x7c6b5f).fillRect(15, 43, 1, 12);
    for (let i = 0; i < 3; i++) {
      const x = 10 - i * 4, y = 4 + i * 12, w = 12 + i * 8;
      g.fillStyle(0x284c5b).fillRect(x, y + 4, w, 12); g.fillStyle(0x426c76).fillRect(x + 2, y + 7, w - 5, 3);
      g.fillStyle(0x7fabb5).fillRect(x, y + 4, w, 4); g.fillStyle(0xc5dcdb).fillRect(x, y + 4, w, 2).fillRect(x + 4, y, w - 8, 4);
      g.fillStyle(0x9fc5ce).fillRect(x + 3, y + 8, 2, 2).fillRect(x + w - 4, y + 7, 1, 3);
    }
  });
  draw('lamp', 16, 48, g => {
    g.fillStyle(0x273c56).fillRect(7, 12, 3, 36).fillRect(3, 46, 11, 2);
    g.fillStyle(0x6a8794).fillRect(7, 19, 1, 27);
    g.fillStyle(0x4d647b).fillRect(2, 4, 13, 15); g.fillStyle(0xffc571).fillRect(4, 6, 9, 10);
    g.fillStyle(0xffe7ac).fillRect(5, 7, 3, 6); g.fillStyle(0xe3f1ed).fillRect(0, 2, 16, 3);
    g.fillStyle(0x293f52).fillRect(8, 5, 1, 12).fillRect(3, 16, 11, 2);
    g.fillStyle(0xb1cfd5).fillRect(3, 45, 11, 1);
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
      if (id === 'ayazhan') g.fillStyle(colors.scarf).fillRect(x + 3, 5, 10, 2).fillRect(x + 6, 0, 4, 2);
      g.fillStyle(0x24364d).fillRect(x + 3 + leg, 20, 4, 4).fillRect(x + 9 - leg, 20, 4, 4);
      g.fillStyle(0xeaf4eb).fillRect(x + 3 + leg, 23, 4, 1).fillRect(x + 9 - leg, 23, 4, 1);
    }
  });
  const texture = scene.textures.get(`winter-player-${id}`);
  for (let frame = 0; frame < 4; frame++) if (!texture.has(String(frame))) texture.add(frame, 0, frame * 16, 0, 16, 24);
}
