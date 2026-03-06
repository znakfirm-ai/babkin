-- Add optional transaction author attribution.
ALTER TABLE "transactions"
ADD COLUMN "created_by_user_id" TEXT;

ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "transactions_created_by_user_id_idx" ON "transactions"("created_by_user_id");
