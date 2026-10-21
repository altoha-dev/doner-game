import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhysicsPlayer, overlaps, PLAYER_PHYSICS as cfg, playerBody, stepPlayers } from '@doner-game/shared';
import type { PhysicsPlayer, PlayerControls, Rect } from '@doner-game/shared';
const floor = { x: 0, y: 272, width: 1152, height: 48 };
const person = (id: string, seat: number, x: number, y = 272) => createPhysicsPlayer(id, seat, x, y);
function simulate(players: PhysicsPlayer[], count: number, inputs: Record<string, { direction: -1 | 0 | 1; jump?: number }>, solids: Rect[] = [floor]) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const controls = new Map<string, PlayerControls>(players.map(p => [p.playerId, { sequence: p.sequence + 1, direction: inputs[p.playerId]?.direction ?? 0, jump: inputs[p.playerId]?.jump ?? p.jumpSerial }]));
    events.push(...stepPlayers(players, controls, solids, 1152, 320));
    for (const p of players) {
      assert.ok(p.x >= cfg.width / 2 && p.x <= 1152 - cfg.width / 2);
      assert.ok(p.y >= cfg.height && p.y <= 320);
      assert.ok(Math.abs(p.velocityX) <= cfg.speed + .001);
      assert.ok(p.velocityY >= -cfg.jump - cfg.headJumpBonus && p.velocityY <= cfg.maxFall);
      assert.ok(!solids.some(s => overlaps({ x: p.x - 4.999, y: p.y - 20.999, width: 9.998, height: 20.998 }, s)), `terrain penetration ${JSON.stringify(p)}`);
    }
  }
  return events;
}
test('opposing players resist and never cross; stable seat order is deterministic', () => {
  const players = [person('a', 0, 48), person('b', 1, 100)], reversed = structuredClone(players).reverse();
  simulate(players, 180, { a: { direction: 1 }, b: { direction: -1 } });
  simulate(reversed, 180, { a: { direction: 1 }, b: { direction: -1 } });
  assert.ok(players[1]!.x - players[0]!.x >= cfg.width - .001);
  assert.deepEqual(players, reversed.reverse());
});
test('push is bounded, cannot drive another body through a wall or arena edge', () => {
  const players = [person('a', 0, 48), person('b', 1, 64)];
  const wall = { x: 140, y: 224, width: 32, height: 48 };
  const events = simulate(players, 50, { a: { direction: 1 } }, [floor, wall]);
  assert.ok(players[1]!.x > 70 && events.some(e => e.kind === 'push'));
  simulate(players, 600, { a: { direction: 1 } }, [floor, wall]);
  assert.ok(players[1]!.x <= 135 && players[1]!.x - players[0]!.x >= cfg.width - .001);
  const edge = [person('a', 0, 1120), person('b', 1, 1147)];
  simulate(edge, 120, { a: { direction: 1 } });
  assert.equal(edge[1]!.x, 1147); assert.ok(edge[1]!.x - edge[0]!.x >= 9.999);
});
test('landing on a head, carrying, and a bounded head jump use actual shared contacts', () => {
  const top = person('top', 1, 64, 232), bottom = person('bottom', 0, 64);
  top.velocityY = 40;
  const events = simulate([bottom, top], 35, {});
  assert.ok(events.some(e => e.kind === 'head'));
  assert.equal(top.supportId, 'bottom'); assert.equal(top.y, bottom.y - cfg.height);
  simulate([bottom, top], 20, { bottom: { direction: 1 } });
  assert.equal(top.supportId, 'bottom'); assert.ok(Math.abs(top.x - bottom.x) < 1);
  const jump = simulate([bottom, top], 1, { top: { direction: 0, jump: 1 } });
  assert.ok(jump.some(e => e.kind === 'head-jump')); assert.ok(top.velocityY < -cfg.jump);
  assert.equal(top.supportId, null);
});
test('simultaneous jumps, stacked ceiling contacts, and disconnected supports stay bounded', () => {
  const players = [person('a', 0, 48), person('b', 1, 59)];
  simulate(players, 1, {}); simulate(players, 90, { a: { direction: 1, jump: 1 }, b: { direction: -1, jump: 1 } });
  assert.ok(!overlaps(playerBody(players[0]!), playerBody(players[1]!)));
  const bottom = person('bottom', 0, 64), top = person('top', 1, 64, 251);
  const ceiling = { x: 32, y: 208, width: 96, height: 16 };
  simulate([bottom, top], 2, {}, [floor, ceiling]);
  simulate([bottom, top], 60, { bottom: { direction: 0, jump: 1 } }, [floor, ceiling]);
  assert.ok(!overlaps(playerBody(bottom), playerBody(top)));
  bottom.active = false;
  simulate([bottom, top], 60, {});
  assert.equal(top.supportId, null); assert.equal(top.y, 272);
});
test('four-player chains remain bounded beside a placed block without accumulated impulses', () => {
  const players = [0, 1, 2, 3].map(seat => person(String(seat), seat, 48 + seat * 12));
  const placed = { x: 176, y: 240, width: 32, height: 32 };
  simulate(players, 900, { '0': { direction: 1 } }, [floor, placed]);
  for (let i = 1; i < 4; i++) assert.ok(players[i]!.x - players[i - 1]!.x >= cfg.width - .01, JSON.stringify(players.map(p => p.x)));
});
test('a jumping support carries its rider once per tick without vertical drift', () => {
  const bottom = person('bottom', 0, 64), top = person('top', 1, 64, 251);
  simulate([bottom, top], 2, {});
  for (let i = 0; i < 12; i++) {
    simulate([bottom, top], 1, { bottom: { direction: 0, jump: 1 } });
    assert.equal(top.supportId, 'bottom');
    assert.ok(Math.abs(bottom.y - top.y - cfg.height) < cfg.tolerance);
  }
});
test('a rider follows the final displacement of a pushed support beside a block', () => {
  const pusher = person('push', 0, 140), bottom = person('bottom', 1, 151), top = person('top', 2, 151, 251);
  const wall = { x: 176, y: 240, width: 32, height: 32 };
  simulate([pusher, bottom, top], 2, {}, [floor, wall]);
  for (let i = 0; i < 90; i++) {
    simulate([pusher, bottom, top], 1, { push: { direction: 1 } }, [floor, wall]);
    assert.ok(Math.abs(top.x - bottom.x) < cfg.tolerance, `tick ${i}: rider ${top.x}, support ${bottom.x}`);
  }
  assert.equal(top.supportId, 'bottom');
  assert.ok(Math.abs(top.x - bottom.x) < cfg.tolerance, `rider ${top.x}, support ${bottom.x}`);
});
