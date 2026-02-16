-- CreateTable income_sources
CREATE TABLE IF NOT EXISTS "income_sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "income_sources_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX IF NOT EXISTS "income_sources_workspace_id_idx" ON "income_sources"("workspace_id");

-- Add FK workspace
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'income_sources_workspace_id_fkey') THEN
    ALTER TABLE "income_sources"
      ADD CONSTRAINT "income_sources_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add column income_source_id to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "income_source_id" TEXT;

-- FK from transactions to income_sources
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_income_source_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_income_source_id_fkey"
      FOREIGN KEY ("income_source_id") REFERENCES "income_sources"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
