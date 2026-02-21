-- Add icon column for income sources
ALTER TABLE "income_sources" ADD COLUMN IF NOT EXISTS "icon" TEXT;
