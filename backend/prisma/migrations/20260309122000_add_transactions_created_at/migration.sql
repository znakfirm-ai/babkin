ALTER TABLE "transactions"
ADD COLUMN "created_at" TIMESTAMP(3);

UPDATE "transactions"
SET "created_at" = "happened_at"
WHERE "created_at" IS NULL;

ALTER TABLE "transactions"
ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" SET NOT NULL;
