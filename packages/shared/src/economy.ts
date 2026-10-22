import type { TrapId } from './traps.js';
import type { TrapPlacement } from './party.js';
import type { OnlineRoom } from './online.js';

export const DONER_RULES = {
  prices: { 'basic-platform': 0, fan: 2, 'arcade-crossbow': 3 }, extraBlock: 1,
  points: [3, 2, 1, 0], rewards: [0, 1, 2, 3], minPlayers: 2,
} as const;
export function roundReward(position: number | null, eligible: boolean, status: string) {
  if (!eligible || status !== 'FINISHED' || position === null || !Number.isSafeInteger(position) || position < 1) return { points: 0, doners: 0 };
  const index = Math.min(position, 4) - 1;
  return { points: DONER_RULES.points[index]!, doners: DONER_RULES.rewards[index]! };
}
export function placementOffer(confirmed: readonly Pick<TrapPlacement, 'catalogId'>[], trapId: TrapId): { slot: 1 | 2; cost: number; endsTurn: boolean } | null {
  if (!confirmed.length) return { slot: 1, cost: DONER_RULES.prices[trapId], endsTurn: trapId !== 'basic-platform' };
  if (confirmed.length === 1 && confirmed[0]!.catalogId === 'basic-platform' && trapId === 'basic-platform') return { slot: 2, cost: DONER_RULES.extraBlock, endsTurn: true };
  return null;
}
export function buildOffer(room: OnlineRoom, playerId: string, trapId: TrapId) {
  return placementOffer(room.match.placements.filter(p => p.ownerId === playerId && p.round === room.match.round), trapId);
}
export interface RoundSettlement {
  round: number; status: 'LEGACY' | 'NOT_STARTED' | 'PENDING' | 'SETTLED';
  participantIds: string[]; playedIds: string[]; settledAt: number | null;
}
export function matchLeaders(room: OnlineRoom): string[] {
  const maximum = Math.max(0, ...room.players.map(p => p.score ?? 0));
  return maximum ? room.players.filter(p => (p.score ?? 0) === maximum).map(p => p.playerId) : [];
}
