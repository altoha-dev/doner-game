-- Additive change: existing progress and balances are preserved.
-- Starter ownership/default selection are backfilled idempotently by the API.
ALTER TABLE "PlayerProgress" ADD COLUMN "selectedCharacterId" TEXT;
