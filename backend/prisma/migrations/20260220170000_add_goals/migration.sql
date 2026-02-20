-- CreateEnum GoalStatus (idempotent)
DO $$
BEGIN
  CREATE TYPE "GoalStatus" AS ENUM ('active', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable goals
CREATE TABLE IF NOT EXISTS "goals" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "target_amount" NUMERIC(18,2) NOT NULL,
    "current_amount" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX IF NOT EXISTS "goals_workspace_id_idx" ON "goals"("workspace_id");

-- ForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_workspace_id_fkey') THEN
    ALTER TABLE "goals"
      ADD CONSTRAINT "goals_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
