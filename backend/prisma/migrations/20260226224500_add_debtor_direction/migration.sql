-- CreateEnum
CREATE TYPE "DebtorDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- AlterTable
ALTER TABLE "debtors"
ADD COLUMN "direction" "DebtorDirection" NOT NULL DEFAULT 'RECEIVABLE';

-- CreateIndex
CREATE INDEX "debtors_workspace_id_direction_idx" ON "debtors"("workspace_id", "direction");
