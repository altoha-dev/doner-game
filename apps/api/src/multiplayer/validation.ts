import { getCharacter } from '@doner-game/shared';
import type { Movement, RoomCommand } from '@doner-game/shared';
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < 1000000000;
export function parseCommand(value: unknown): RoomCommand | null {
  if (!record(value) || typeof value.type !== 'string') return null;
  const v = value; let valid = false;
  switch (v.type) {
    case 'CREATE': valid = keys(v, ['type', 'capacity']) && Number.isInteger(v.capacity) && Number(v.capacity) >= 2 && Number(v.capacity) <= 4; break;
    case 'JOIN': valid = keys(v, ['type', 'code']) && typeof v.code === 'string' && /^[A-Z2-9]{6}$/i.test(v.code); break;
    case 'READY': valid = keys(v, ['type', 'ready']) && typeof v.ready === 'boolean'; break;
    case 'CHARACTER': valid = keys(v, ['type', 'characterId']) && typeof v.characterId === 'string' && Boolean(getCharacter(v.characterId)); break;
    case 'PLACE': valid = keys(v, ['type', 'round', 'commandId', 'expectedRevision', 'position']) && integer(v.round) && integer(v.expectedRevision) && typeof v.commandId === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(v.commandId) && record(v.position) && keys(v.position, ['x', 'y']) && typeof v.position.x === 'number' && Number.isFinite(v.position.x) && typeof v.position.y === 'number' && Number.isFinite(v.position.y); break;
    case 'SKIP': valid = keys(v, ['type', 'round']) && integer(v.round); break;
    case 'RESUME': case 'LEAVE': case 'START': case 'NEXT': case 'CLOSE': valid = keys(v, ['type']); break;
  }
  return valid ? v as unknown as RoomCommand : null;
}
export function parseMovement(value: unknown): Movement | null {
  if (!record(value) || !keys(value, ['round', 'sequence', 'x', 'y', 'velocityX', 'velocityY'])) return null;
  if (!integer(value.round) || !integer(value.sequence) || !['x', 'y', 'velocityX', 'velocityY'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))) return null;
  return value as unknown as Movement;
}
export class RateGate {
  private buckets = new Map<string, { count: number; until: number }>();
  take(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now(); let bucket = this.buckets.get(key);
    if (!bucket || bucket.until < now) { bucket = { count: 0, until: now + windowMs }; this.buckets.set(key, bucket); }
    if (this.buckets.size > 10000) for (const [k, b] of this.buckets) if (b.until < now) this.buckets.delete(k);
    return ++bucket.count <= limit;
  }
}
