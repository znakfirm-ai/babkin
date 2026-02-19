-- Add archived_at for soft delete of accounts
ALTER TABLE "accounts" ADD COLUMN "archived_at" TIMESTAMP NULL;
