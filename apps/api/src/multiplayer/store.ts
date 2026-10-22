import { buildMiniAppLink, getCharacter, getTrap, trapOrientation, ONLINE_RULES, SNOWY_CHAOS, placementOffer } from '@doner-game/shared';
import type { MatchPhase, OnlineRoom, OnlineFinish } from '@doner-game/shared';
import { purchase, settleRound, EconomyError } from './economy.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export function roomStore(db: PrismaClient, botUsername?: string) {
  return {
    async load(onlyId?: string): Promise<OnlineRoom[]> {
      const rows = await db.room.findMany({ where: onlyId ? { id: onlyId } : { OR: [{ phase: { not: 'MATCH_FINISHED' } }, { rounds: { some: { settlement: 'PENDING' } } }] }, include: { players: { include: { user: { include: { progress: true } } }, orderBy: { joinedAt: 'asc' } }, placements: true, finishes: true, rounds: true } });
      return rows.map(r => ({ roomId: r.id, code: r.code, hostId: r.hostUserId, capacity: r.capacity, revision: r.revision,
        expiresAt: r.expiresAt.getTime(), deadline: r.deadline?.getTime() ?? null, raceStartedAt: r.raceStartedAt?.getTime() ?? null,
        inviteLink: botUsername ? buildMiniAppLink(botUsername, `room_${r.code}`) : null, recoveryMessage: r.recoveryMessage,
        balances: Object.fromEntries(r.players.map(p => [p.userId, p.user.progress?.doners ?? 0])),
        rounds: r.rounds.map(x => ({ round: x.roundNumber, status: x.settlement as NonNullable<OnlineRoom['rounds']>[number]['status'], participantIds: x.participantIds, playedIds: x.playedIds, settledAt: x.settledAt?.getTime() ?? null })),
        players: r.players.map(p => ({ playerId: p.userId, displayName: displayName(p.user.firstName, p.user.username), photoUrl: p.user.photoUrl,
          characterId: getCharacter(p.chosenCharacterId)?.id ?? 'altoha', ready: p.ready, connected: p.connected, score: p.score, left: p.left, buildDone: p.buildDone, seat: p.seat })),
        match: { matchId: r.id, arenaId: SNOWY_CHAOS.id, arenaRevision: SNOWY_CHAOS.revision, revision: r.revision, phase: r.phase as MatchPhase, round: r.currentRound,
          placements: r.placements.map(p => ({ id: p.placementId, catalogId: getTrap(p.objectType)?.id ?? 'basic-platform', orientation: trapOrientation(p.objectType, p.orientation) ?? getTrap(p.objectType)?.orientations[0] ?? 'none', ownerId: p.userId, round: p.roundNumber, slot: p.slot as 1 | 2, cost: p.cost, x: p.gridX, y: p.gridY, ...(getTrap(p.objectType)?.dimensions ?? { width: 32, height: 16 }) })), results: [] },
        finishes: r.finishes.map(f => ({ playerId: f.userId, round: f.roundNumber, points: f.points, doners: f.doners, status: f.status as OnlineFinish['status'], position: f.finishPosition, durationMs: f.finishDuration, finishedAt: f.finishTimestamp?.getTime() ?? null })),
      }));
    },
    async save(room: OnlineRoom, isNew = false): Promise<void> {
      const balances = await db.$transaction(async tx => {
        const data = { code: room.code, hostUserId: room.hostId, phase: room.match.phase, capacity: room.capacity, currentRound: room.match.round, revision: room.revision,
          deadline: room.deadline === null ? null : new Date(room.deadline), raceStartedAt: room.raceStartedAt === null ? null : new Date(room.raceStartedAt),
          recoveryMessage: room.recoveryMessage, expiresAt: new Date(room.expiresAt) };
        if (isNew) await tx.room.create({ data: { id: room.roomId, ...data } });
        else {
          const updated = await tx.room.updateMany({ where: { id: room.roomId, revision: room.revision - 1 }, data });
          if (updated.count !== 1) throw new Error('ROOM_REVISION_CONFLICT');
        }
        for (const p of room.players) {
          const values = { chosenCharacterId: p.characterId, activeUserId: p.left || room.match.phase === 'MATCH_FINISHED' ? null : p.playerId,
            ready: p.ready, connected: p.connected, left: p.left, buildDone: p.buildDone, seat: p.seat };
          await tx.roomPlayer.upsert({ where: { roomId_userId: { roomId: room.roomId, userId: p.playerId } }, create: { roomId: room.roomId, userId: p.playerId, ...values }, update: values });
        }
        if (room.match.round > 0) {
          const round = room.rounds?.find(r => r.round === room.match.round);
          const fields = { phase: room.match.phase, ...(round ? { settlement: round.status, participantIds: round.participantIds, playedIds: round.playedIds } : {}) };
          await tx.matchRound.upsert({ where: { roomId_roundNumber: { roomId: room.roomId, roundNumber: room.match.round } },
            create: { roomId: room.roomId, roundNumber: room.match.round, ...fields },
            update: { ...fields, endedAt: ['RESULTS', 'MATCH_FINISHED'].includes(room.match.phase) ? new Date() : null } });
        }
        // Only this room's persisted placements are idempotent. A commandId already
        // owned by another room must fail the transaction, never create a phantom block.
        const storedPlacements = room.match.placements.length ? await tx.trapPlacement.findMany({ where: { roomId: room.roomId }, select: { placementId: true } }) : [];
        const storedIds = new Set(storedPlacements.map(p => p.placementId));
        for (const p of room.match.placements.filter(p => !storedIds.has(p.id))) {
          const confirmed = await tx.trapPlacement.findMany({ where: { roomId: room.roomId, roundNumber: p.round, userId: p.ownerId } });
          const offer = placementOffer(confirmed.map(p => ({ catalogId: getTrap(p.objectType)!.id })), p.catalogId);
          if (!offer || offer.slot !== (p.slot ?? 1)) throw new EconomyError('NO_SLOT', 'Нет доступного размещения.');
          await purchase(tx, p.ownerId, room.roomId, p.round, p.id, offer.cost);
          await tx.trapPlacement.create({ data: { placementId: p.id, roomId: room.roomId, roundNumber: p.round, userId: p.ownerId, objectType: p.catalogId, orientation: trapOrientation(p.catalogId, p.orientation)!, slot: offer.slot, cost: offer.cost, gridX: p.x, gridY: p.y } });
        }
        await tx.roundFinish.createMany({ data: room.finishes.map(f => ({ roomId: room.roomId, roundNumber: f.round, userId: f.playerId, status: f.status, finishPosition: f.position, finishDuration: f.durationMs, finishTimestamp: f.finishedAt === null ? null : new Date(f.finishedAt) })), skipDuplicates: true });
        const progress = await tx.playerProgress.findMany({ where: { userId: { in: room.players.map(p => p.playerId) } }, select: { userId: true, doners: true } });
        return Object.fromEntries(progress.map(p => [p.userId, p.doners]));
      });
      room.balances = balances;
    },
    async settle(roomId: string, round: number) { await db.$transaction(tx => settleRound(tx, roomId, round)); },
  };
}
export function displayName(firstName: string, username: string | null): string {
  return Array.from((firstName || username || 'Игрок').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, ONLINE_RULES.maxNameLength).join('') || 'Игрок';
}
export type RoomStore = ReturnType<typeof roomStore>;
