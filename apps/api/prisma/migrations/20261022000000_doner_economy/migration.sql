ALTER TABLE "RoomPlayer" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchRound" ADD COLUMN "settlement" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "participantIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "playedIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "settledAt" TIMESTAMPTZ(3);
ALTER TABLE "TrapPlacement" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cost" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "TrapPlacement_roomId_roundNumber_userId_key";
CREATE UNIQUE INDEX "TrapPlacement_roomId_roundNumber_userId_slot_key" ON "TrapPlacement"("roomId", "roundNumber", "userId", "slot");
ALTER TABLE "TrapPlacement" ADD CONSTRAINT "TrapPlacement_slot_check" CHECK ("slot" IN (1, 2)),
  ADD CONSTRAINT "TrapPlacement_cost_check" CHECK ("cost" >= 0);
ALTER TABLE "RoundFinish" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doners" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "DonerTransaction" (
  "id" UUID NOT NULL, "key" TEXT NOT NULL, "userId" UUID NOT NULL,
  "amount" INTEGER NOT NULL, "transactionType" TEXT NOT NULL,
  "roomId" UUID, "roundNumber" INTEGER NOT NULL, "placementId" TEXT,
  "balanceAfter" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DonerTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DonerTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DonerTransaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DonerTransaction_balance_check" CHECK ("balanceAfter" >= 0),
  CONSTRAINT "DonerTransaction_type_check" CHECK (("transactionType" = 'ROUND_REWARD' AND "amount" >= 0 AND "placementId" IS NULL) OR ("transactionType" = 'TRAP_PURCHASE' AND "amount" < 0 AND "placementId" IS NOT NULL))
);
CREATE UNIQUE INDEX "DonerTransaction_key_key" ON "DonerTransaction"("key");
CREATE UNIQUE INDEX "DonerTransaction_placementId_key" ON "DonerTransaction"("placementId");
CREATE UNIQUE INDEX "DonerTransaction_reward_once" ON "DonerTransaction"("roomId", "roundNumber", "userId") WHERE "transactionType" = 'ROUND_REWARD';
CREATE INDEX "DonerTransaction_userId_createdAt_idx" ON "DonerTransaction"("userId", "createdAt");
