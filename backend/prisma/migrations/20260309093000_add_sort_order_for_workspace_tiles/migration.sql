ALTER TABLE "accounts" ADD COLUMN "sort_order" INTEGER;
ALTER TABLE "categories" ADD COLUMN "sort_order" INTEGER;
ALTER TABLE "income_sources" ADD COLUMN "sort_order" INTEGER;
ALTER TABLE "goals" ADD COLUMN "sort_order" INTEGER;
ALTER TABLE "debtors" ADD COLUMN "sort_order" INTEGER;

WITH ranked_accounts AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC, id ASC) - 1 AS sort_order
  FROM "accounts"
)
UPDATE "accounts" AS target
SET "sort_order" = ranked_accounts.sort_order
FROM ranked_accounts
WHERE target.id = ranked_accounts.id;

WITH ranked_categories AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC, id ASC) - 1 AS sort_order
  FROM "categories"
)
UPDATE "categories" AS target
SET "sort_order" = ranked_categories.sort_order
FROM ranked_categories
WHERE target.id = ranked_categories.id;

WITH ranked_income_sources AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC, id ASC) - 1 AS sort_order
  FROM "income_sources"
)
UPDATE "income_sources" AS target
SET "sort_order" = ranked_income_sources.sort_order
FROM ranked_income_sources
WHERE target.id = ranked_income_sources.id;

WITH ranked_goals AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC, id ASC) - 1 AS sort_order
  FROM "goals"
)
UPDATE "goals" AS target
SET "sort_order" = ranked_goals.sort_order
FROM ranked_goals
WHERE target.id = ranked_goals.id;

WITH ranked_debtors AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id, direction ORDER BY created_at ASC, id ASC) - 1 AS sort_order
  FROM "debtors"
)
UPDATE "debtors" AS target
SET "sort_order" = ranked_debtors.sort_order
FROM ranked_debtors
WHERE target.id = ranked_debtors.id;

ALTER TABLE "accounts" ALTER COLUMN "sort_order" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "sort_order" SET NOT NULL;
ALTER TABLE "income_sources" ALTER COLUMN "sort_order" SET NOT NULL;
ALTER TABLE "goals" ALTER COLUMN "sort_order" SET NOT NULL;
ALTER TABLE "debtors" ALTER COLUMN "sort_order" SET NOT NULL;

ALTER TABLE "accounts" ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE "categories" ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE "income_sources" ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE "goals" ALTER COLUMN "sort_order" SET DEFAULT 0;
ALTER TABLE "debtors" ALTER COLUMN "sort_order" SET DEFAULT 0;

CREATE INDEX "accounts_workspace_id_sort_order_idx" ON "accounts"("workspace_id", "sort_order");
CREATE INDEX "categories_workspace_id_sort_order_idx" ON "categories"("workspace_id", "sort_order");
CREATE INDEX "income_sources_workspace_id_sort_order_idx" ON "income_sources"("workspace_id", "sort_order");
CREATE INDEX "goals_workspace_id_sort_order_idx" ON "goals"("workspace_id", "sort_order");
CREATE INDEX "debtors_workspace_id_direction_sort_order_idx" ON "debtors"("workspace_id", "direction", "sort_order");
