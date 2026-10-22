import { overlaps } from './party.js';
import type { ArenaDefinition, Rect } from './party.js';

/** Conservative body-clearance flood fill with a bounded climb. Not a timing proof for hazards. */
export function hasGeometricRoute(arena: ArenaDefinition, solids: readonly Rect[]): boolean {
  const grid = 4, width = Math.floor(arena.width / grid), height = Math.floor(arena.height / grid) + 1;
  const free = new Uint8Array(width * height), ground = new Uint8Array(width * height);
  for (let y = 6; y < height; y++) for (let x = 2; x < width - 1; x++) {
    const body = { x: x * grid - 4.999, y: y * grid - 20.999, width: 9.998, height: 20.998 };
    const cell = y * width + x;
    if (solids.some(s => overlaps(body, s))) continue;
    free[cell] = 1;
    if (solids.some(s => Math.abs(s.y - y * grid) < .01 && body.x < s.x + s.width && body.x + body.width > s.x)) ground[cell] = 1;
  }
  const visited = new Uint8Array(width * height * 11), queue: number[] = [];
  // mode0 = falling/walking; mode1..10 = remaining ascent. A new jump requires support.
  const enqueue = (cell: number, mode: number) => { const key = cell * 11 + mode; if (free[cell] && !visited[key]) { visited[key] = 1; queue.push(key); } };
  const spawn = arena.spawns[0]!;
  enqueue(Math.round(spawn.y / grid) * width + Math.round(spawn.x / grid), 0);
  for (let index = 0; index < queue.length; index++) {
    const key = queue[index]!, cell = Math.floor(key / 11), mode = key % 11, x = cell % width, y = Math.floor(cell / width);
    if (overlaps({ x: x * grid - 5, y: y * grid - 21, width: 10, height: 21 }, arena.finish)) return true;
    enqueue(cell - 1, mode); enqueue(cell + 1, mode);
    if (y + 1 < height) enqueue(cell + width, 0);
    if (y > 6 && (ground[cell] || mode > 1)) enqueue(cell - width, ground[cell] ? 9 : mode - 1);
  }
  return false;
}
