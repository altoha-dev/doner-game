import { buildMiniAppLink, getCharacter, ONLINE_RULES, SNOWY_CHAOS } from '@doner-game/shared';
import type { MatchPhase, OnlineRoom, OnlineFinish } from '@doner-game/shared';
import type { PrismaClient } from '../generated/prisma/client.js';

export function roomStore(db: PrismaClient, botUsername?: string) {
  return {
    async load(): Promise<OnlineRoom[]> {
      const rows = await db.room.findMany({ where: { phase: { not: 'MATCH_FINISHED' } }, include: { players: { include: { user: true }, orderBy: { joinedAt: 'asc' } }, placements: true, finishes: true } });
      return rows.map(r => ({ roomId: r.id, code: r.code, hostId: r.hostUserId, capacity: r.capacity, revision: r.revision,
        expiresAt: r.expiresAt.getTime(), deadline: r.deadline?.getTime() ?? null, raceStartedAt: r.raceStartedAt?.getTime() ?? null,
        inviteLink: botUsername ? buildMiniAppLink(botUsername, `room_${r.code}`) : null, recoveryMessage: r.recoveryMessage,
        players: r.players.map(p => ({ playerId: p.userId, displayName: displayName(p.user.firstName, p.user.username), photoUrl: p.user.photoUrl,
          characterId: getCharacter(p.chosenCharacterId)?.id ?? 'altoha', ready: p.ready, connected: false, left: p.left, buildDone: p.buildDone, seat: p.seat })),
        match: { matchId: r.id, arenaId: SNOWY_CHAOS.id, arenaRevision: SNOWY_CHAOS.revision, revision: r.revision, phase: r.phase as MatchPhase, round: r.currentRound,
          placements: r.placements.map(p => ({ id: p.placementId, catalogId: 'basic-platform' as const, ownerId: p.userId, round: p.roundNumber, x: p.gridX, y: p.gridY, width: 32, height: 16 })), results: [] },
        finishes: r.finishes.map(f => ({ playerId: f.userId, round: f.roundNumber, status: f.status as OnlineFinish['status'], position: f.finishPosition, durationMs: f.finishDuration, finishedAt: f.finishTimestamp?.getTime() ?? null })),
      }));
    },
    async save(room: OnlineRoom, isNew = false): Promise<void> {
      await db.$transaction(async tx => {
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
        if (room.match.round > 0) await tx.matchRound.upsert({
          where: { roomId_roundNumber: { roomId: room.roomId, roundNumber: room.match.round } },
          create: { roomId: room.roomId, roundNumber: room.match.round, phase: room.match.phase },
          update: { phase: room.match.phase, endedAt: ['RESULTS', 'MATCH_FINISHED'].includes(room.match.phase) ? new Date() : null },
        });
        // Only this room's persisted placements are idempotent. A commandId already
        // owned by another room must fail the transaction, never create a phantom block.
        const storedPlacements = room.match.placements.length ? await tx.trapPlacement.findMany({ where: { roomId: room.roomId }, select: { placementId: true } }) : [];
        const storedIds = new Set(storedPlacements.map(p => p.placementId));
        await tx.trapPlacement.createMany({ data: room.match.placements.filter(p => !storedIds.has(p.id)).map(p => ({ placementId: p.id, roomId: room.roomId, roundNumber: p.round, userId: p.ownerId, objectType: p.catalogId, gridX: p.x, gridY: p.y })) });
        await tx.roundFinish.createMany({ data: room.finishes.map(f => ({ roomId: room.roomId, roundNumber: f.round, userId: f.playerId, status: f.status, finishPosition: f.position, finishDuration: f.durationMs, finishTimestamp: f.finishedAt === null ? null : new Date(f.finishedAt) })), skipDuplicates: true });
      });
    },
  };
}
export function displayName(firstName: string, username: string | null): string {
  return Array.from((firstName || username || 'Игрок').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, ONLINE_RULES.maxNameLength).join('') || 'Игрок';
}
export type RoomStore = ReturnType<typeof roomStore>;
