import { DONER_RULES, roundReward } from '@doner-game/shared';
import type { Prisma } from '../generated/prisma/client.js';

export class EconomyError extends Error { constructor(readonly code: string, message: string) { super(message); } }
export async function purchase(tx: Prisma.TransactionClient, userId: string, roomId: string, roundNumber: number, placementId: string, cost: number) {
  if (!cost) return;
  const debit = await tx.playerProgress.updateMany({ where: { userId, doners: { gte: cost } }, data: { doners: { decrement: cost } } });
  if (debit.count !== 1) throw new EconomyError('INSUFFICIENT_DONER', 'Не хватает Doner. Обновите баланс или выберите бесплатный блок.');
  const progress = await tx.playerProgress.findUniqueOrThrow({ where: { userId } });
  await tx.donerTransaction.create({ data: { key: `purchase:${placementId}`, userId, roomId, roundNumber, placementId, amount: -cost, transactionType: 'TRAP_PURCHASE', balanceAfter: progress.doners } });
}
/** Caller holds Room + MatchRound row locks. Results and activity are server-persisted. */
export async function settleRound(tx: Prisma.TransactionClient, roomId: string, roundNumber: number) {
  await tx.$queryRaw`SELECT "id" FROM "Room" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "roomId" FROM "MatchRound" WHERE "roomId" = ${roomId}::uuid AND "roundNumber" = ${roundNumber} FOR UPDATE`;
  const round = await tx.matchRound.findUnique({ where: { roomId_roundNumber: { roomId, roundNumber } } });
  if (!round || round.settlement !== 'PENDING' || !['RESULTS', 'MATCH_FINISHED'].includes(round.phase)) return;
  const finishes = await tx.roundFinish.findMany({ where: { roomId, roundNumber }, orderBy: { userId: 'asc' } });
  const played = new Set(round.playedIds.filter(id => round.participantIds.includes(id)));
  const eligible = played.size >= DONER_RULES.minPlayers && !finishes.some(f => f.status === 'ABORTED');
  // Stable account lock order; increments cooperate with concurrent profile purchases.
  for (const finish of finishes) {
    const reward = roundReward(finish.finishPosition, eligible && played.has(finish.userId), finish.status);
    await tx.roundFinish.update({ where: { roomId_roundNumber_userId: { roomId, roundNumber, userId: finish.userId } }, data: reward });
    if (!eligible || !played.has(finish.userId) || finish.status !== 'FINISHED') continue;
    const progress = await tx.playerProgress.update({ where: { userId: finish.userId }, data: { doners: { increment: reward.doners } } });
    await tx.donerTransaction.create({ data: { key: `reward:${roomId}:${roundNumber}:${finish.userId}`, userId: finish.userId, roomId, roundNumber, amount: reward.doners, transactionType: 'ROUND_REWARD', balanceAfter: progress.doners } });
    await tx.roomPlayer.update({ where: { roomId_userId: { roomId, userId: finish.userId } }, data: { score: { increment: reward.points } } });
  }
  await tx.matchRound.update({ where: { roomId_roundNumber: { roomId, roundNumber } }, data: { settlement: 'SETTLED', settledAt: new Date() } });
  await tx.room.update({ where: { id: roomId }, data: { revision: { increment: 1 } } });
}
