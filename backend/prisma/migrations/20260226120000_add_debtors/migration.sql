-- CreateEnum
CREATE TYPE "DebtorStatus" AS ENUM ('active', 'completed');

-- CreateTable
CREATE TABLE "debtors" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "principal_amount" DECIMAL(18,2) NOT NULL,
    "due_at" TIMESTAMP(3),
    "payoff_amount" DECIMAL(18,2),
    "status" "DebtorStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debtors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debtors_workspace_id_idx" ON "debtors"("workspace_id");

-- CreateIndex
CREATE INDEX "debtors_workspace_id_status_idx" ON "debtors"("workspace_id", "status");

-- AddForeignKey
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
