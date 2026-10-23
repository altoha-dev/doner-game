import Phaser from 'phaser';
import type { ArenaDefinition } from '@doner-game/shared';
import { ARENA_VISUALS } from './level';

// All layers below are paint only. Colliders come exclusively from the shared arena.
export function drawArena(scene: Phaser.Scene, arena: ArenaDefinition, reducedMotion: boolean) {
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-10);
  sky.fillStyle(0x152a43).fillRect(0, 0, 1600, 400);
  sky.fillStyle(0x1b344e).fillRect(0, 52, 1600, 348);
  sky.fillStyle(0x233e56).fillRect(0, 104, 1600, 296);
  sky.fillStyle(0x2b495f).fillRect(0, 152, 1600, 248);
  sky.fillStyle(0x2a465d).fillRect(70, 16, 36, 32);
  sky.fillStyle(0xb5d9df).fillRect(78, 20, 20, 24).fillRect(74, 24, 28, 16);
  sky.fillStyle(0x152a43).fillRect(86, 16, 20, 24);
  for (let i = 0; i < 45; i++) sky.fillStyle(i % 5 ? 0x7899aa : 0xd9bd91).fillRect((i * 71 + 13) % 600, (i * 37 + 8) % 110, i % 5 ? 1 : 2, 2);
  const hills = scene.add.graphics().setScrollFactor(.18).setDepth(-8);
  for (let i = 0; i < 13; i++) {
    const x = i * 96 - 64, y = 94 + (i % 3) * 12;
    hills.fillStyle(0x304d64).fillRect(x, y + 24, 128, 240).fillRect(x + 16, y + 12, 96, 240).fillRect(x + 40, y, 48, 240);
    hills.fillStyle(0x46657a).fillRect(x + 40, y, 48, 3).fillRect(x + 16, y + 12, 24, 3);
  }
  const town = scene.add.graphics().setScrollFactor(.45).setDepth(-6);
  for (let i = 0; i < 16; i++) {
    const x = i * 78 - 28, y = 146 + (i % 3) * 12;
    town.fillStyle(i % 2 ? 0x30495d : 0x344e61).fillRect(x, y, 56, 126);
    town.fillStyle(0x263f54).fillRect(x + 48, y + 3, 8, 123).fillRect(x + 39, y - 14, 6, 14);
    town.fillStyle(0x5b788b).fillRect(x - 3, y, 62, 3).fillRect(x + 5, y - 6, 46, 6);
    town.fillStyle(0x7993a1).fillRect(x + 5, y - 6, 46, 2).fillRect(x - 3, y, 18, 1);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const wx = x + 7 + col * 14, wy = y + 12 + row * 22;
      town.fillStyle(0x243c50).fillRect(wx, wy, 8, 11);
      town.fillStyle((row + col + i) % 3 ? 0x617e88 : 0xa08c70).fillRect(wx + 1, wy + 1, 5, 8);
      town.fillStyle(0x3e596b).fillRect(wx - 1, wy + 11, 10, 1);
    }
  }
  for (let i = 0; i < 17; i++) scene.add.image(i * 80 + 26, 272, 'pine').setOrigin(.5, 1).setDepth(-3).setAlpha(i % 3 ? .65 : .85);
  const cabin = scene.add.graphics().setDepth(-2);
  for (const x of [340, 704]) {
    cabin.fillStyle(0x203347).fillRect(x - 1, 224, 62, 48);
    cabin.fillStyle(0x695656).fillRect(x + 1, 227, 57, 45);
    cabin.fillStyle(0x7d6460).fillRect(x + 2, 230, 54, 1).fillRect(x + 2, 262, 54, 1);
    cabin.fillStyle(0x4b6578).fillRect(x - 4, 222, 68, 6).fillRect(x + 4, 214, 52, 8).fillRect(x + 12, 208, 36, 6);
    cabin.fillStyle(0xc5dce0).fillRect(x - 4, 222, 68, 3).fillRect(x + 4, 214, 52, 3).fillRect(x + 12, 208, 36, 3);
    cabin.fillStyle(0x8db4c6).fillRect(x + 3, 225, 2, 5).fillRect(x + 53, 225, 2, 4);
    cabin.fillStyle(0x22384b).fillRect(x + 6, 238, 30, 18).fillRect(x + 43, 233, 12, 39);
    cabin.fillStyle(0xcf9e69).fillRect(x + 8, 240, 26, 13);
    cabin.fillStyle(0xf3c98a).fillRect(x + 9, 240, 24, 5);
    cabin.fillStyle(0x866749).fillRect(x + 20, 240, 2, 13).fillRect(x + 11, 250, 18, 3);
    cabin.fillStyle(0xe9d7b3).fillRect(x + 7, 255, 30, 2);
    for (let i = 0; i < 6; i++) cabin.fillStyle(i % 2 ? 0xc4b599 : 0x9d6f60).fillRect(x + 6 + i * 5, 235, 5, 4);
    cabin.fillStyle(0x85a8b5).fillRect(x + 45, 236, 8, 13);
    cabin.fillStyle(0xdcba7c).fillRect(x + 44, 255, 1, 2);
    cabin.fillStyle(0x20374a).fillRect(x + 10, 218, 40, 13);
    cabin.fillStyle(0xd5ab79).fillRect(x + 11, 219, 38, 1).fillRect(x + 11, 229, 38, 1);
    scene.add.text(x + 15, 220, 'DONER', { fontFamily: 'monospace', fontSize: '8px', color: '#f1ce91' }).setDepth(-1);
  }
  for (const region of ARENA_VISUALS) {
    for (let y = 0; y < region.height; y += 16) for (let x = 0; x < region.width; x += 16) {
      scene.add.image(region.x + x, region.y + y, y ? 'rock' : region.material).setOrigin(0).setDepth(0);
    }
    const edge = scene.add.graphics().setDepth(1);
    edge.fillStyle(0x182e43, .5).fillRect(region.x, region.y + region.height - 2, region.width, 2);
    if (region.material === 'ice') {
      for (let x = 4; x < region.width; x += 16) {
        edge.fillStyle(0x82b5c9).fillRect(region.x + x, region.y + 16, 3, 4 + x % 3);
        edge.fillStyle(0xc3e4e6).fillRect(region.x + x, region.y + 16, 1, 5 + x % 3);
      }
    }
  }
  for (const x of [112, 416, 768, 1120]) {
    scene.add.image(x, 272, 'lamp').setOrigin(.5, 1).setDepth(1);
    const glow = scene.add.graphics().setDepth(-1).setAlpha(.12);
    glow.fillStyle(0xffce8b).fillRect(x - 12, 229, 24, 23).fillRect(x - 17, 234, 34, 13);
    if (!reducedMotion) scene.tweens.add({ targets: glow, alpha: .18, duration: 2300, yoyo: true, repeat: -1 });
  }
  scene.add.image(144, 272, 'snowman').setOrigin(.5, 1);
  const markers = scene.add.graphics().setDepth(2);
  markers.fillStyle(0x94cad0).fillRect(32, 270, 72, 2);
  markers.fillStyle(0x42697c).fillRect(30, 240, 3, 30).fillRect(30, 240, 20, 12);
  markers.fillStyle(0xd8eae1).fillRect(31, 239, 20, 2);
  markers.fillStyle(0xaedbd4).fillRect(34, 243, 10, 2).fillRect(42, 242, 2, 4).fillRect(44, 243, 2, 2);
  const finish = arena.finish;
  markers.fillStyle(0x233c50).fillRect(finish.x - 1, finish.y - 1, 5, finish.height + 1).fillRect(finish.x + 31, finish.y - 1, 5, finish.height + 1);
  markers.fillStyle(0xc89b6c).fillRect(finish.x, finish.y, 3, finish.height).fillRect(finish.x + 32, finish.y, 3, finish.height);
  markers.fillStyle(0xf3e6ce).fillRect(finish.x, finish.y - 8, 35, 10);
  for (let i = 0; i < 7; i++) markers.fillStyle(0x31465e).fillRect(finish.x + i * 5, finish.y - 8 + (i % 2) * 5, 5, 5);
  markers.fillStyle(0xe4efe5).fillRect(finish.x - 2, finish.y - 10, 39, 2);
  markers.fillStyle(0xffcd82).fillRect(finish.x - 1, finish.y + 4, 5, 3).fillRect(finish.x + 31, finish.y + 4, 5, 3);
  scene.add.text(33, 282, 'START', { fontFamily: 'monospace', fontSize: '8px', color: '#bbdde7' });
  scene.add.text(finish.x - 2, 282, 'FINISH', { fontFamily: 'monospace', fontSize: '8px', color: '#ffd398' });
  // Low-cost fixed snow specks; optional animation touches only one object.
  const snow = scene.add.graphics().setScrollFactor(.6).setDepth(8);
  for (let i = 0; i < 60; i++) snow.fillStyle(0xd8e7ee, .35).fillRect((i * 73) % arena.width, 120 + (i * 43) % 130, 1, 1);
  if (!reducedMotion) scene.tweens.add({ targets: snow, y: 6, duration: 2400, yoyo: true, repeat: -1 });
}
