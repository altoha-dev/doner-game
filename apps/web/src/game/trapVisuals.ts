import Phaser from 'phaser';
import { getTrap, trapOrientation, trapZone, segmentHit, SNOWY_CHAOS } from '@doner-game/shared';
import type { Orientation, TrapId, TrapPlacement, TrapSnapshot } from '@doner-game/shared';

import { trapPixels } from './winterArt';

export function drawTrap(g: Phaser.GameObjects.Graphics, id: TrapId, x: number, y: number, direction?: Orientation, tick = 0) {
  for (const p of trapPixels(id, trapOrientation(id, direction)!, tick)) g.fillStyle(p.color).fillRect(Math.round(x) + p.x, Math.round(y) + p.y, p.w, p.h);
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
      const px = Math.round(x), py = Math.round(shot.y), tail = shot.velocityX > 0 ? -1 : 1;
      this.g.fillStyle(0x80bbce, .4).fillRect(px + tail * 5 - 2, py - 1, 4, 2);
      this.g.fillStyle(0x375a77).fillRect(px - 4, py - 2, 8, 4).fillStyle(0xeaf4e8).fillRect(px - 3, py - 1, 6, 2).fillRect(px - 1, py - 2, 2, 4);
    }
    if (!this.reducedMotion) for (const hit of state.hits) if (tick - hit.tick < 12) {
      const d = Math.max(2, Math.floor(tick - hit.tick));
      this.g.fillStyle(0xffc68a, 1 - d / 14);
      for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) this.g.fillRect(Math.round(hit.x + dx! * d), Math.round(hit.y - 10 + dy! * d), 2, 2);
    }
  }
}
