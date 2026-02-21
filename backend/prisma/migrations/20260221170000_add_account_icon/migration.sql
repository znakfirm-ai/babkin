-- Add icon column for accounts
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "icon" TEXT;
