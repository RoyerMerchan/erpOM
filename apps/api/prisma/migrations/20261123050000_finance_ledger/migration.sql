-- CreateEnum
CREATE TYPE "FinanceEntryKind" AS ENUM ('EXPENSE', 'OTHER_INCOME', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "FinanceDirection" AS ENUM ('IN', 'OUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierMoneyKind" ADD VALUE 'FINANCE_IN';
ALTER TYPE "SupplierMoneyKind" ADD VALUE 'FINANCE_OUT';

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "finance_line_id" UUID;

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(160) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" UUID NOT NULL,
    "number" BIGSERIAL NOT NULL,
    "operation_key" UUID NOT NULL,
    "operation_digest" CHAR(64) NOT NULL,
    "kind" "FinanceEntryKind" NOT NULL,
    "category_id" UUID,
    "category_name" VARCHAR(100),
    "description" TEXT NOT NULL,
    "reference" VARCHAR(120),
    "difference_usd" DECIMAL(48,2),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID NOT NULL,
    "actor_name" VARCHAR(120) NOT NULL,
    "reverses_id" UUID,

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "direction" "FinanceDirection" NOT NULL,
    "account_id" UUID NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "exchange_rate_id" UUID,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "amount_original" DECIMAL(38,8) NOT NULL,
    "amount_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "finance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_name_key_key" ON "finance_categories"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entries_number_key" ON "finance_entries"("number");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entries_operation_key_key" ON "finance_entries"("operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entries_reverses_id_key" ON "finance_entries"("reverses_id");

-- CreateIndex
CREATE INDEX "finance_entries_kind_occurred_at_idx" ON "finance_entries"("kind", "occurred_at");

-- CreateIndex
CREATE INDEX "finance_entries_category_id_idx" ON "finance_entries"("category_id");

-- CreateIndex
CREATE INDEX "finance_lines_account_id_idx" ON "finance_lines"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_lines_entry_id_position_key" ON "finance_lines"("entry_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "money_movements_finance_line_id_key" ON "money_movements"("finance_line_id");

-- CreateIndex
CREATE INDEX "money_movements_occurred_at_id_idx" ON "money_movements"("occurred_at", "id");

-- CreateIndex
CREATE INDEX "money_movements_currency_code_occurred_at_idx" ON "money_movements"("currency_code", "occurred_at");

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_finance_line_id_fkey" FOREIGN KEY ("finance_line_id") REFERENCES "finance_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "finance_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_lines" ADD CONSTRAINT "finance_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "finance_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_lines" ADD CONSTRAINT "finance_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_lines" ADD CONSTRAINT "finance_lines_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_lines" ADD CONSTRAINT "finance_lines_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the original journal and add one optional source for a manual line.
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_valid";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_valid" CHECK (
  num_nonnulls(payment_id, sale_tender_id, layaway_payment_id, correction_tender_id, finance_line_id) = 1 AND (
    (kind::text IN ('SUPPLIER_PAYMENT','SUPPLIER_PAYMENT_REVERSAL') AND payment_id IS NOT NULL)
    OR (kind::text IN ('SALE_PAYMENT','SALE_CHANGE') AND sale_tender_id IS NOT NULL)
    OR (kind::text IN ('LAYAWAY_DEPOSIT','LAYAWAY_REFUND') AND layaway_payment_id IS NOT NULL)
    OR (kind::text IN ('EXCHANGE_PAYMENT','SALE_REFUND') AND correction_tender_id IS NOT NULL)
    OR (kind::text IN ('FINANCE_IN','FINANCE_OUT') AND finance_line_id IS NOT NULL)
  )
);
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_terms_valid" CHECK (
  number > 0 AND length(trim(description)) > 0
  AND (reverses_id IS NULL OR reverses_id <> id)
  AND ((kind = 'TRANSFER') = (difference_usd IS NOT NULL))
  AND (CASE WHEN kind = 'EXPENSE' THEN category_id IS NOT NULL AND category_name IS NOT NULL
            ELSE category_id IS NULL AND category_name IS NULL END)
);
ALTER TABLE "finance_lines" ADD CONSTRAINT "finance_lines_terms_valid" CHECK (
  position >= 0 AND amount_original > 0 AND amount_usd > 0 AND units_per_usd > 0
  AND (CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL ELSE exchange_rate_id IS NOT NULL END)
);
CREATE TRIGGER finance_entries_append_only BEFORE UPDATE OR DELETE ON "finance_entries"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER finance_lines_append_only BEFORE UPDATE OR DELETE ON "finance_lines"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();

INSERT INTO "permissions" ("id", "code", "label") VALUES
  (gen_random_uuid(), 'finance.read', 'Consultar saldos y movimientos de finanzas'),
  (gen_random_uuid(), 'finance.post', 'Registrar gastos, otros ingresos y transferencias'),
  (gen_random_uuid(), 'finance.adjust', 'Registrar ajustes de cuenta'),
  (gen_random_uuid(), 'finance.reverse', 'Revertir registros financieros'),
  (gen_random_uuid(), 'finance.categories.manage', 'Configurar categorías de gasto')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE p.code IN ('finance.read','finance.post','finance.adjust','finance.reverse','finance.categories.manage')
  AND (r.code IN ('ADMIN','FINANCE') OR (r.code = 'MANAGER' AND p.code <> 'finance.adjust'))
ON CONFLICT DO NOTHING;
