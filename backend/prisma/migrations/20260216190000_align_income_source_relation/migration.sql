-- Ensure income_source_id column exists on transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "income_source_id" TEXT;

-- Ensure index for income_source_id
CREATE INDEX IF NOT EXISTS "transactions_income_source_id_idx" ON "transactions"("income_source_id");

-- Ensure FK from transactions to income_sources
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_income_source_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_income_source_id_fkey"
      FOREIGN KEY ("income_source_id") REFERENCES "income_sources"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
