import type { PlayerProfileDto } from '@doner-game/shared';
import type { Prisma, PrismaClient } from './generated/prisma/client.js';
import type { VerifiedTelegramUser } from './telegram-auth.js';

export interface PlayerStore {
  login(user: VerifiedTelegramUser): Promise<PlayerProfileDto>;
  findById(id: string): Promise<PlayerProfileDto | null>;
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
    },
  };
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
        await tx.playerProgress.upsert({
          where: { userId: user.id },
          create: { userId: user.id },
          update: {}, // Never reset progress on login; also repair a missing row.
        });
        // No characters are unlocked or removed by authentication.
        return toProfile(await tx.user.findUniqueOrThrow({ where: { id: user.id }, include: relations }));
      });
    },
    async findById(id) {
      const user = await db.user.findUnique({ where: { id }, include: relations });
      return user ? toProfile(user) : null;
    },
  };
}
