-- Add soft-archive fields for categories and income sources
ALTER TABLE "categories" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN "archived_at" TIMESTAMP NULL;

ALTER TABLE "income_sources" ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "income_sources" ADD COLUMN "archived_at" TIMESTAMP NULL;
