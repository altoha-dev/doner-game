-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "photoUrl" TEXT,
    "languageCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastLoginAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerProgress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "doners" INTEGER NOT NULL DEFAULT 0,
    "goldenDoners" INTEGER NOT NULL DEFAULT 0,
    "campaignStage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnlockedCharacter" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "characterId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnlockedCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProgress_userId_key" ON "PlayerProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnlockedCharacter_userId_characterId_key" ON "UnlockedCharacter"("userId", "characterId");

-- AddForeignKey
ALTER TABLE "PlayerProgress" ADD CONSTRAINT "PlayerProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnlockedCharacter" ADD CONSTRAINT "UnlockedCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
