-- AlterTable
ALTER TABLE "transactions"
ADD COLUMN "debtor_id" TEXT;

-- CreateIndex
CREATE INDEX "transactions_debtor_id_idx" ON "transactions"("debtor_id");

-- AddForeignKey
ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
