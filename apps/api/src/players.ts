import { CHARACTERS, STARTER_CHARACTER, getCharacter } from '@doner-game/shared';
import type { PlayerProfileDto, PlayerProgressDto, UnlockCharacterResponseDto } from '@doner-game/shared';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';
import type { VerifiedTelegramUser } from './telegram-auth.js';
import { ApiError } from './errors.js';

export interface PlayerStore {
  login(user: VerifiedTelegramUser): Promise<PlayerProfileDto>;
  findById(id: string): Promise<PlayerProfileDto | null>;
  unlockCharacter(id: string, characterId: string): Promise<UnlockCharacterResponseDto>;
  selectCharacter(id: string, characterId: string): Promise<PlayerProgressDto>;
}

const relations = {
  progress: true,
  unlockedCharacters: { select: { characterId: true }, orderBy: { unlockedAt: 'asc' } },
} satisfies Prisma.UserInclude;

function toProfile(user: Prisma.UserGetPayload<{ include: typeof relations }>): PlayerProfileDto {
  if (!user.progress) throw new Error('PlayerProgress is missing.');
  return {
    user: {
      id: user.id,
      telegramId: user.telegramId.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      photoUrl: user.photoUrl,
      languageCode: user.languageCode,
    },
    progress: {
      doners: user.progress.doners,
      goldenDoners: user.progress.goldenDoners,
      campaignStage: user.progress.campaignStage,
      unlockedCharacterIds: user.unlockedCharacters.map(character => character.characterId),
      selectedCharacterId: user.progress.selectedCharacterId,
    },
  };
}

async function ensureStarter(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.playerProgress.upsert({ where: { userId }, create: { userId }, update: {} });
  await tx.unlockedCharacter.createMany({
    data: CHARACTERS.filter(character => character.starter).map(character => ({ userId, characterId: character.id })),
    skipDuplicates: true,
  });
  // Never overwrite a player's existing selection or reset their progress.
  await tx.playerProgress.updateMany({
    where: { userId, selectedCharacterId: null },
    data: { selectedCharacterId: STARTER_CHARACTER.id },
  });
}

async function lockPlayer(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
  // All character writes and backfill lock the same row first. Concurrent
  // requests (even across API processes) observe the previous committed result.
  // Parameterized SQL: the ID is never interpolated into SQL text.
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${id}::uuid FOR UPDATE`;
  return rows.length > 0;
}

async function readProfile(tx: Prisma.TransactionClient, id: string): Promise<PlayerProfileDto> {
  return toProfile(await tx.user.findUniqueOrThrow({ where: { id }, include: relations }));
}

function requireCharacter(id: string) {
  const character = getCharacter(id);
  if (!character) throw new ApiError(400, 'INVALID_CHARACTER', 'Unknown character.');
  return character;
}

export function createPlayerStore(db: PrismaClient): PlayerStore {
  return {
    async login(identity) {
      return db.$transaction(async (tx) => {
        const profile = { ...identity, lastLoginAt: new Date() };
        // Keep this a single-table upsert so PostgreSQL handles concurrent logins
        // with ON CONFLICT. Nested writes would disable Prisma's native upsert.
        const user = await tx.user.upsert({
          where: { telegramId: identity.telegramId },
          create: profile,
          update: profile,
        });
        // The upsert already holds a lock on this User until commit.
        await ensureStarter(tx, user.id);
        return readProfile(tx, user.id);
      });
    },
    async findById(id) {
      return db.$transaction(async tx => {
        if (!await lockPlayer(tx, id)) return null;
        await ensureStarter(tx, id);
        return readProfile(tx, id);
      });
    },
    async unlockCharacter(id, characterId) {
      const character = requireCharacter(characterId);
      return db.$transaction(async tx => {
        if (!await lockPlayer(tx, id)) throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Player no longer exists.');
        await ensureStarter(tx, id);
        const owned = await tx.unlockedCharacter.findUnique({ where: { userId_characterId: { userId: id, characterId } } });
        if (owned) return { result: 'already_unlocked', progress: (await readProfile(tx, id)).progress };
        const charged = await tx.playerProgress.updateMany({
          where: { userId: id, doners: { gte: character.unlockCost } },
          data: { doners: { decrement: character.unlockCost } },
        });
        if (charged.count !== 1) throw new ApiError(409, 'INSUFFICIENT_DONERS', 'Not enough Doners.');
        await tx.unlockedCharacter.create({ data: { userId: id, characterId } });
        return { result: 'unlocked', progress: (await readProfile(tx, id)).progress };
      });
    },
    async selectCharacter(id, characterId) {
      requireCharacter(characterId);
      return db.$transaction(async tx => {
        if (!await lockPlayer(tx, id)) throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'Player no longer exists.');
        await ensureStarter(tx, id);
        const owned = await tx.unlockedCharacter.findUnique({ where: { userId_characterId: { userId: id, characterId } } });
        if (!owned) throw new ApiError(403, 'CHARACTER_LOCKED', 'Unlock this character first.');
        await tx.playerProgress.update({ where: { userId: id }, data: { selectedCharacterId: characterId } });
        return (await readProfile(tx, id)).progress;
      });
    },
  };
}
