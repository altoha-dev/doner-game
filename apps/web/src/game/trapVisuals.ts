import Phaser from 'phaser';
import { getTrap, trapOrientation, trapZone, segmentHit, SNOWY_CHAOS } from '@doner-game/shared';
import type { Orientation, TrapId, TrapPlacement, TrapSnapshot } from '@doner-game/shared';

// Original integer-pixel artwork. One renderer registry, replaceable through catalog visual IDs.
type Painter = (g: Phaser.GameObjects.Graphics, x: number, y: number, facing: Orientation, frame: number) => void;
const painters: Record<string, Painter> = {
  'built-block': (g, x, y) => {
    g.fillStyle(0x885c42).fillRect(x, y, 32, 16).fillStyle(0xc69567).fillRect(x + 1, y + 3, 30, 10);
    g.fillStyle(0xeaf5ec).fillRect(x, y, 32, 3).fillStyle(0x815538).fillRect(x + 14, y + 4, 2, 10);
  },
  'trap-fan': (g, x, y, facing, frame) => {
    g.fillStyle(0x34516d).fillRect(x, y, 32, 16).fillStyle(0x82bdca).fillRect(x + 2, y + 2, 28, 12);
    g.fillStyle(0x1b354c).fillRect(x + 9, y + 2, 14, 12).fillStyle(0xd8f0ed);
    if (Math.floor(frame / 6) % 2) g.fillRect(x + 12, y + 3, 3, 5).fillRect(x + 17, y + 8, 3, 5).fillRect(x + 10, y + 9, 5, 2).fillRect(x + 17, y + 4, 5, 2);
    else g.fillRect(x + 15, y + 3, 3, 10).fillRect(x + 10, y + 7, 12, 3);
    g.fillStyle(0xffc981).fillRect(x + 15, y + 7, 3, 3);
    g.fillStyle(0xeaf5ec).fillRect(x, y, 8, 2).fillRect(x + 24, y, 8, 2);
    arrow(g, x + (facing === 'left' ? 4 : facing === 'right' ? 27 : 16), y + 6, facing);
  },
  'trap-crossbow': (g, x, y, facing, frame) => {
    const left = facing === 'left';
    const box = (a: number, b: number, w: number, h: number, color: number) => g.fillStyle(color).fillRect(x + (left ? 32 - a - w : a), y + b, w, h);
    box(2, 12, 28, 4, 0x60758b); box(8, 7, 16, 6, 0xa67d63); box(10, 1, 4, 14, 0xcda77d);
    box(14, 2, 6, 3, 0xf1f5e9); box(14, 11, 6, 3, 0xf1f5e9); box(4, 6, 26, 3, 0x4a647b);
    box(23, 6, 7, 3, Math.floor(frame) % 120 >= 96 ? 0xffc277 : 0x9edce6);
    arrow(g, x + (left ? 3 : 29), y + 7, facing);
  },
};
function arrow(g: Phaser.GameObjects.Graphics, x: number, y: number, facing: Orientation) {
  g.fillStyle(0xffd18a);
  if (facing === 'up') g.fillRect(x - 1, y - 5, 3, 6).fillRect(x - 3, y - 3, 7, 2);
  else { const sign = facing === 'left' ? -1 : 1; g.fillRect(x - 2, y, 5, 2).fillRect(x + sign * 2, y - 2, 2, 6); }
}
export function drawTrap(g: Phaser.GameObjects.Graphics, id: TrapId, x: number, y: number, direction?: Orientation, tick = 0) {
  const trap = getTrap(id)!;
  painters[trap.visual]!(g, Math.round(x), Math.round(y), trapOrientation(id, direction)!, tick);
}
export class TrapRenderer {
  private g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, private reducedMotion: boolean) { this.g = scene.add.graphics().setDepth(4); }
  draw(placements: readonly TrapPlacement[], tick: number, racing: boolean, state?: TrapSnapshot, elapsed = 0) {
    this.g.clear();
    for (const p of placements) {
      const trap = getTrap(p.catalogId)!;
      if (trap.activation.kind === 'none') continue; // Platforms keep the existing texture/static body.
      const zone = { ...trapZone(p)! };
      if (trap.activation.kind === 'crossbow') {
        const right = trapOrientation(p.catalogId, p.orientation) === 'right';
        const start = { x: right ? p.x + p.width + 3 : p.x - 3, y: p.y + 8 };
        const end = { x: right ? Math.min(SNOWY_CHAOS.width, zone.x + zone.width) : Math.max(0, zone.x), y: start.y };
        let fraction = 1;
        for (const solid of [...SNOWY_CHAOS.geometry, ...placements.filter(s => s.id !== p.id)]) fraction = Math.min(fraction, segmentHit(start, end, solid, trap.activation.radius) ?? 1);
        const stop = start.x + (end.x - start.x) * fraction;
        zone.x = Math.min(start.x, stop); zone.width = Math.abs(stop - start.x);
      }
      this.g.fillStyle(trap.category === 'air' ? 0x8ad7e5 : 0xffc48a, racing ? .055 : .035).fillRect(zone.x, zone.y, zone.width, zone.height);
      drawTrap(this.g, p.catalogId, p.x, p.y, p.orientation, racing && !this.reducedMotion ? tick : 0);
      if (trap.activation.kind === 'fan' && racing) for (let i = 0; i < 5; i++) {
        const f = ((this.reducedMotion ? 20 : tick * 2) + i * 19) % 96;
        const dir = trapOrientation(p.catalogId, p.orientation);
        const x = dir === 'up' ? p.x + 5 + i * 5 : dir === 'left' ? p.x - f : p.x + p.width + f;
        const y = dir === 'up' ? p.y - f : p.y + 2 + (i % 3) * 5;
        this.g.fillStyle(0xb6e5e5, .55).fillRect(Math.round(x), Math.round(y), dir === 'up' ? 1 : 5, dir === 'up' ? 5 : 1);
      }
      if (trap.activation.kind === 'crossbow') {
        const warning = racing && Math.floor(tick) % trap.activation.intervalTicks >= trap.activation.intervalTicks - trap.activation.warningTicks;
        this.g.fillStyle(warning ? 0xffbb7c : 0x9cc7d2, warning ? .7 : .2);
        for (let x = zone.x; x < zone.x + zone.width; x += 16) this.g.fillRect(Math.round(x), p.y + 8, 4, 1);
      }
    }
    if (!racing || !state) return;
    for (const shot of state.projectiles) {
      const end = { x: shot.x + shot.velocityX * Math.min(1000 / 15, elapsed) / 1000, y: shot.y };
      let fraction = 1;
      for (const solid of [...SNOWY_CHAOS.geometry, ...placements]) fraction = Math.min(fraction, segmentHit(shot, end, solid, shot.radius) ?? 1);
      const x = shot.x + (end.x - shot.x) * fraction;
      this.g.fillStyle(0x375a77).fillRect(Math.round(x) - 4, shot.y - 2, 8, 4).fillStyle(0xecf7ef).fillRect(Math.round(x) - 3, shot.y - 1, 6, 2);
    }
    if (!this.reducedMotion) for (const hit of state.hits) if (tick - hit.tick < 12) {
      const d = Math.max(2, Math.floor(tick - hit.tick));
      this.g.fillStyle(0xffc68a, 1 - d / 14);
      for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) this.g.fillRect(Math.round(hit.x + dx! * d), Math.round(hit.y - 10 + dy! * d), 2, 2);
    }
  }
}
