import Phaser from 'phaser';
import type { ArenaDefinition } from '@doner-game/shared';
import { ARENA_VISUALS } from './level';

export function drawArena(scene: Phaser.Scene, arena: ArenaDefinition, reducedMotion: boolean) {
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-10);
  sky.fillStyle(0x101e38).fillRect(0, 0, 1600, 400);
  sky.fillStyle(0xb5d9df).fillRect(78, 20, 20, 24).fillRect(74, 24, 28, 16);
  sky.fillStyle(0x101e38).fillRect(86, 16, 20, 24);
  for (let i = 0; i < 45; i++) {
    sky.fillStyle(i % 5 ? 0x7899ba : 0xf6d4a1).fillRect((i * 71 + 13) % 600, (i * 37 + 8) % 110, i % 5 ? 1 : 2, 2);
  }
  const hills = scene.add.graphics().setScrollFactor(.25).setDepth(-8);
  for (let i = 0; i < 15; i++) {
    const x = i * 72 - 64, y = 90 + (i % 3) * 14;
    hills.fillStyle(0x263c59).fillRect(x, y + 24, 104, 250).fillRect(x + 16, y + 8, 72, 250).fillRect(x + 32, y, 40, 250);
    hills.fillStyle(0x526b83).fillRect(x + 32, y, 40, 5).fillRect(x + 16, y + 8, 24, 4);
  }
  for (let i = 0; i < 17; i++) scene.add.image(i * 80 + 26, 272, 'pine').setOrigin(.5, 1).setDepth(-2).setAlpha(i % 3 ? .7 : 1);
  const cabin = scene.add.graphics().setDepth(-1);
  for (const x of [340, 704]) {
    cabin.fillStyle(0x4d4650).fillRect(x, 226, 56, 46);
    cabin.fillStyle(0x9ebbc8).fillRect(x - 4, 222, 64, 6).fillRect(x + 4, 214, 48, 8).fillRect(x + 12, 208, 32, 6);
    cabin.fillStyle(0xf6bb72).fillRect(x + 8, 238, 12, 14).fillRect(x + 36, 238, 12, 14);
    cabin.fillStyle(0x6e5a55).fillRect(x + 25, 242, 8, 30);
  }
  for (const region of ARENA_VISUALS) {
    for (let y = 0; y < region.height; y += 16) for (let x = 0; x < region.width; x += 16) {
      scene.add.image(region.x + x, region.y + y, y ? 'rock' : region.material).setOrigin(0).setDepth(0);
    }
    if (region.material === 'ice') {
      const g = scene.add.graphics(); g.fillStyle(0x8fcbdc);
      for (let x = 4; x < region.width; x += 16) g.fillRect(region.x + x, region.y + 16, 2, 5 + x % 3);
    }
  }
  for (const x of [112, 416, 768, 1120]) {
    scene.add.image(x, 272, 'lamp').setOrigin(.5, 1).setDepth(1);
    const glow = scene.add.rectangle(x, 238, 26, 24, 0xffc378, .08).setDepth(-1);
    if (!reducedMotion) scene.tweens.add({ targets: glow, alpha: .16, duration: 2300, yoyo: true, repeat: -1 });
  }
  scene.add.image(144, 272, 'snowman').setOrigin(.5, 1);
  const markers = scene.add.graphics().setDepth(2);
  markers.fillStyle(0x94cad0).fillRect(32, 270, 72, 2);
  const finish = arena.finish;
  markers.fillStyle(0xdda36d).fillRect(finish.x, finish.y, 3, finish.height).fillRect(finish.x + 32, finish.y, 3, finish.height);
  markers.fillStyle(0xf3e6ce).fillRect(finish.x, finish.y - 8, 35, 10);
  for (let i = 0; i < 7; i++) markers.fillStyle(0x31465e).fillRect(finish.x + i * 5, finish.y - 8 + (i % 2) * 5, 5, 5);
  scene.add.text(33, 282, 'START', { fontFamily: 'monospace', fontSize: '8px', color: '#bbdde7' });
  scene.add.text(finish.x - 2, 282, 'FINISH', { fontFamily: 'monospace', fontSize: '8px', color: '#ffd398' });
  // Low-cost fixed snow specks; optional animation touches only one object.
  const snow = scene.add.graphics().setScrollFactor(.6).setDepth(8);
  for (let i = 0; i < 60; i++) snow.fillStyle(0xd8e7ee, .45).fillRect((i * 73) % arena.width, 120 + (i * 43) % 130, 1, 1);
  if (!reducedMotion) scene.tweens.add({ targets: snow, y: 6, duration: 2400, yoyo: true, repeat: -1 });
}
