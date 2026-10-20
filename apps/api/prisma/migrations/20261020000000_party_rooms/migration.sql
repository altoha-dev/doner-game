-- Additive Stage 6.1 tables. No existing balances, identities or ownership are changed.
CREATE TABLE "Room" (
 "id" UUID NOT NULL, "code" VARCHAR(6) NOT NULL, "hostUserId" UUID NOT NULL,
 "phase" TEXT NOT NULL DEFAULT 'LOBBY', "capacity" INTEGER NOT NULL DEFAULT 4,
 "currentRound" INTEGER NOT NULL DEFAULT 0, "revision" INTEGER NOT NULL DEFAULT 0,
 "deadline" TIMESTAMPTZ(3), "raceStartedAt" TIMESTAMPTZ(3), "recoveryMessage" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Room_pkey" PRIMARY KEY ("id"), CONSTRAINT "Room_capacity_check" CHECK ("capacity" BETWEEN 2 AND 4)
);
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
CREATE INDEX "Room_expiresAt_idx" ON "Room"("expiresAt");
CREATE TABLE "RoomPlayer" (
 "roomId" UUID NOT NULL, "userId" UUID NOT NULL, "activeUserId" UUID,
 "chosenCharacterId" TEXT NOT NULL, "ready" BOOLEAN NOT NULL DEFAULT false,
 "connected" BOOLEAN NOT NULL DEFAULT false, "left" BOOLEAN NOT NULL DEFAULT false,
 "buildDone" BOOLEAN NOT NULL DEFAULT false, "seat" INTEGER NOT NULL,
 "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RoomPlayer_pkey" PRIMARY KEY ("roomId","userId"),
 CONSTRAINT "RoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "RoomPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RoomPlayer_activeUserId_key" ON "RoomPlayer"("activeUserId");
CREATE TABLE "MatchRound" (
 "roomId" UUID NOT NULL, "roundNumber" INTEGER NOT NULL, "phase" TEXT NOT NULL,
 "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMPTZ(3),
 CONSTRAINT "MatchRound_pkey" PRIMARY KEY ("roomId","roundNumber"),
 CONSTRAINT "MatchRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "TrapPlacement" (
 "placementId" TEXT NOT NULL, "roomId" UUID NOT NULL, "roundNumber" INTEGER NOT NULL,
 "userId" UUID NOT NULL, "objectType" TEXT NOT NULL, "gridX" INTEGER NOT NULL, "gridY" INTEGER NOT NULL,
 CONSTRAINT "TrapPlacement_pkey" PRIMARY KEY ("placementId"),
 CONSTRAINT "TrapPlacement_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TrapPlacement_roomId_roundNumber_userId_key" ON "TrapPlacement"("roomId","roundNumber","userId");
CREATE TABLE "RoundFinish" (
 "roomId" UUID NOT NULL, "roundNumber" INTEGER NOT NULL, "userId" UUID NOT NULL,
 "status" TEXT NOT NULL, "finishPosition" INTEGER, "finishTimestamp" TIMESTAMPTZ(3), "finishDuration" INTEGER,
 CONSTRAINT "RoundFinish_pkey" PRIMARY KEY ("roomId","roundNumber","userId"),
 CONSTRAINT "RoundFinish_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RoundFinish_roomId_roundNumber_finishPosition_key" ON "RoundFinish"("roomId","roundNumber","finishPosition");
