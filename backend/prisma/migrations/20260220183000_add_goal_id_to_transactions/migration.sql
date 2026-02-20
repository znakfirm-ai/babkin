-- Add goal_id column to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "goal_id" TEXT;

-- Index
CREATE INDEX IF NOT EXISTS "transactions_goal_id_idx" ON "transactions"("goal_id");

-- Foreign key
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_goal_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_goal_id_fkey"
      FOREIGN KEY ("goal_id") REFERENCES "goals"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
