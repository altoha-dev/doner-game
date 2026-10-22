-- Existing basic-platform placements keep their stable ID and default orientation.
ALTER TABLE "TrapPlacement" ADD COLUMN "orientation" TEXT NOT NULL DEFAULT 'none';
