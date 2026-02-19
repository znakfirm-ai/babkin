-- Add soft-delete flag for accounts
ALTER TABLE "accounts" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
