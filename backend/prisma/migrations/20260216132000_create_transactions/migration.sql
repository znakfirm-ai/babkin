-- CreateEnum TransactionKind (idempotent)
DO $$
BEGIN
  CREATE TYPE "TransactionKind" AS ENUM ('income', 'expense', 'transfer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable transactions
CREATE TABLE IF NOT EXISTS "transactions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "amount" NUMERIC(18,2) NOT NULL,
    "happened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "account_id" TEXT,
    "category_id" TEXT,
    "from_account_id" TEXT,
    "to_account_id" TEXT,
    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "transactions_workspace_id_idx" ON "transactions"("workspace_id");
CREATE INDEX IF NOT EXISTS "transactions_account_id_idx" ON "transactions"("account_id");
CREATE INDEX IF NOT EXISTS "transactions_category_id_idx" ON "transactions"("category_id");
CREATE INDEX IF NOT EXISTS "transactions_from_account_id_idx" ON "transactions"("from_account_id");
CREATE INDEX IF NOT EXISTS "transactions_to_account_id_idx" ON "transactions"("to_account_id");

-- Foreign Keys (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_workspace_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_workspace_id_fkey"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_account_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_account_id_fkey"
      FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_category_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_from_account_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_from_account_id_fkey"
      FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_to_account_id_fkey') THEN
    ALTER TABLE "transactions"
      ADD CONSTRAINT "transactions_to_account_id_fkey"
      FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
