-- Add column income_source_id to transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "income_source_id" TEXT;

-- Index (optional, only if lookups expected). Skipping new index to keep minimal.

-- No FK added because income_sources table is not in prisma schema.
