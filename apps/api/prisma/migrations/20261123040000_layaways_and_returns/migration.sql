-- CreateEnum
CREATE TYPE "LayawayStatus" AS ENUM ('ACTIVE', 'PAID', 'DELIVERED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LayawayRefundPolicy" AS ENUM ('FULL_REFUND', 'RETAIN');

-- CreateEnum
CREATE TYPE "LayawayActionKind" AS ENUM ('CREATE', 'PAY', 'DELIVER', 'CANCEL', 'EXPIRE');

-- CreateEnum
CREATE TYPE "LayawayPaymentKind" AS ENUM ('DEPOSIT', 'REFUND');

-- CreateEnum
CREATE TYPE "SaleCorrectionKind" AS ENUM ('RETURN', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('SELLABLE', 'DEFECTIVE');

-- CreateEnum
CREATE TYPE "CorrectionTenderKind" AS ENUM ('PAYMENT', 'REFUND');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementKind" ADD VALUE 'RESERVE';
ALTER TYPE "StockMovementKind" ADD VALUE 'RELEASE_RESERVATION';
ALTER TYPE "StockMovementKind" ADD VALUE 'SALE_RETURN_IN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierMoneyKind" ADD VALUE 'LAYAWAY_DEPOSIT';
ALTER TYPE "SupplierMoneyKind" ADD VALUE 'LAYAWAY_REFUND';
ALTER TYPE "SupplierMoneyKind" ADD VALUE 'EXCHANGE_PAYMENT';
ALTER TYPE "SupplierMoneyKind" ADD VALUE 'SALE_REFUND';

-- AlterTable
ALTER TABLE "shop_settings" ADD COLUMN     "layaway_refund_policy" "LayawayRefundPolicy" NOT NULL DEFAULT 'FULL_REFUND';

-- AlterTable
ALTER TABLE "inventory_lots" ADD COLUMN     "correction_item_id" UUID,
ADD COLUMN     "origin_lot_id" UUID;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "correction_item_id" UUID,
ADD COLUMN     "layaway_item_id" UUID,
ADD COLUMN     "reserved_delta" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "correction_tender_id" UUID,
ADD COLUMN     "layaway_payment_id" UUID;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "exchange_id" UUID,
ADD COLUMN     "layaway_id" UUID;

-- CreateTable
CREATE TABLE "layaways" (
    "id" UUID NOT NULL,
    "number" BIGSERIAL NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_name" VARCHAR(160) NOT NULL,
    "seller_id" UUID NOT NULL,
    "seller_name" VARCHAR(120) NOT NULL,
    "notes" TEXT,
    "status" "LayawayStatus" NOT NULL DEFAULT 'ACTIVE',
    "refund_policy" "LayawayRefundPolicy" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "total_usd" DECIMAL(48,2) NOT NULL,
    "paid_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "layaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_items" (
    "id" UUID NOT NULL,
    "layaway_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "brand_name" VARCHAR(120) NOT NULL,
    "model_name" VARCHAR(140) NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "size" SMALLINT NOT NULL,
    "color" VARCHAR(80),
    "quantity" INTEGER NOT NULL,
    "unit_price_usd" DECIMAL(18,2) NOT NULL,
    "total_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "layaway_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_actions" (
    "id" UUID NOT NULL,
    "layaway_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_name" VARCHAR(120) NOT NULL,
    "kind" "LayawayActionKind" NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "layaway_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layaway_payments" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "LayawayPaymentKind" NOT NULL,
    "reversed_id" UUID,
    "account_id" UUID NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "exchange_rate_id" UUID,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "amount_original" DECIMAL(38,8) NOT NULL,
    "amount_usd" DECIMAL(48,2) NOT NULL,
    "reference" VARCHAR(120),

    CONSTRAINT "layaway_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_corrections" (
    "id" UUID NOT NULL,
    "number" BIGSERIAL NOT NULL,
    "operation_key" UUID NOT NULL,
    "operation_digest" CHAR(64) NOT NULL,
    "sale_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_name" VARCHAR(120) NOT NULL,
    "kind" "SaleCorrectionKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "returned_usd" DECIMAL(48,2) NOT NULL,
    "restored_cogs_usd" DECIMAL(48,2) NOT NULL,
    "replacement_total_usd" DECIMAL(48,2) NOT NULL,
    "difference_usd" DECIMAL(48,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sale_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_correction_items" (
    "id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "credit_usd" DECIMAL(48,2) NOT NULL,
    "restored_cogs_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "sale_correction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_tenders" (
    "id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "CorrectionTenderKind" NOT NULL,
    "account_id" UUID NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "exchange_rate_id" UUID,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "amount_original" DECIMAL(38,8) NOT NULL,
    "amount_usd" DECIMAL(48,2) NOT NULL,
    "reference" VARCHAR(120),

    CONSTRAINT "correction_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "layaways_number_key" ON "layaways"("number");

-- CreateIndex
CREATE INDEX "layaways_status_expires_at_idx" ON "layaways"("status", "expires_at");

-- CreateIndex
CREATE INDEX "layaways_created_at_id_idx" ON "layaways"("created_at", "id");

-- CreateIndex
CREATE INDEX "layaways_seller_id_created_at_idx" ON "layaways"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "layaways_customer_id_created_at_idx" ON "layaways"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "layaway_items_variant_id_idx" ON "layaway_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "layaway_items_layaway_id_position_key" ON "layaway_items"("layaway_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "layaway_items_layaway_id_variant_id_key" ON "layaway_items"("layaway_id", "variant_id");

-- CreateIndex
CREATE INDEX "layaway_actions_layaway_id_occurred_at_idx" ON "layaway_actions"("layaway_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "layaway_payments_reversed_id_key" ON "layaway_payments"("reversed_id");

-- CreateIndex
CREATE INDEX "layaway_payments_account_id_idx" ON "layaway_payments"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "layaway_payments_action_id_position_key" ON "layaway_payments"("action_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "sale_corrections_number_key" ON "sale_corrections"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sale_corrections_operation_key_key" ON "sale_corrections"("operation_key");

-- CreateIndex
CREATE INDEX "sale_corrections_sale_id_created_at_idx" ON "sale_corrections"("sale_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_corrections_created_at_id_idx" ON "sale_corrections"("created_at", "id");

-- CreateIndex
CREATE INDEX "sale_correction_items_sale_item_id_idx" ON "sale_correction_items"("sale_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_correction_items_correction_id_position_key" ON "sale_correction_items"("correction_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "sale_correction_items_correction_id_sale_item_id_condition_key" ON "sale_correction_items"("correction_id", "sale_item_id", "condition");

-- CreateIndex
CREATE INDEX "correction_tenders_account_id_idx" ON "correction_tenders"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "correction_tenders_correction_id_position_key" ON "correction_tenders"("correction_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_correction_item_id_key" ON "stock_movements"("correction_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_layaway_item_id_kind_key" ON "stock_movements"("layaway_item_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "money_movements_layaway_payment_id_key" ON "money_movements"("layaway_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "money_movements_correction_tender_id_key" ON "money_movements"("correction_tender_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_layaway_id_key" ON "sales"("layaway_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_exchange_id_key" ON "sales"("exchange_id");

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_correction_item_id_fkey" FOREIGN KEY ("correction_item_id") REFERENCES "sale_correction_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_origin_lot_id_fkey" FOREIGN KEY ("origin_lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_layaway_item_id_fkey" FOREIGN KEY ("layaway_item_id") REFERENCES "layaway_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_correction_item_id_fkey" FOREIGN KEY ("correction_item_id") REFERENCES "sale_correction_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_layaway_payment_id_fkey" FOREIGN KEY ("layaway_payment_id") REFERENCES "layaway_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_correction_tender_id_fkey" FOREIGN KEY ("correction_tender_id") REFERENCES "correction_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_layaway_id_fkey" FOREIGN KEY ("layaway_id") REFERENCES "layaways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_exchange_id_fkey" FOREIGN KEY ("exchange_id") REFERENCES "sale_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaways" ADD CONSTRAINT "layaways_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaways" ADD CONSTRAINT "layaways_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_items" ADD CONSTRAINT "layaway_items_layaway_id_fkey" FOREIGN KEY ("layaway_id") REFERENCES "layaways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_items" ADD CONSTRAINT "layaway_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_actions" ADD CONSTRAINT "layaway_actions_layaway_id_fkey" FOREIGN KEY ("layaway_id") REFERENCES "layaways"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_actions" ADD CONSTRAINT "layaway_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "layaway_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_reversed_id_fkey" FOREIGN KEY ("reversed_id") REFERENCES "layaway_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_corrections" ADD CONSTRAINT "sale_corrections_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_corrections" ADD CONSTRAINT "sale_corrections_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_correction_items" ADD CONSTRAINT "sale_correction_items_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "sale_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_correction_items" ADD CONSTRAINT "sale_correction_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_tenders" ADD CONSTRAINT "correction_tenders_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "sale_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_tenders" ADD CONSTRAINT "correction_tenders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_tenders" ADD CONSTRAINT "correction_tenders_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_tenders" ADD CONSTRAINT "correction_tenders_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep reservation deltas separate from physical stock.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_source_valid";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_valid" CHECK (
  (kind::text IN ('RESERVE', 'RELEASE_RESERVATION') AND quantity_delta = 0 AND layaway_item_id IS NOT NULL
    AND purchase_item_id IS NULL AND sale_item_id IS NULL AND correction_item_id IS NULL
    AND (CASE WHEN kind::text = 'RESERVE' THEN reserved_delta > 0 ELSE reserved_delta < 0 END))
  OR (reserved_delta = 0 AND layaway_item_id IS NULL AND (
    (kind::text = 'SALE_RETURN_IN' AND quantity_delta > 0 AND correction_item_id IS NOT NULL AND purchase_item_id IS NULL AND sale_item_id IS NULL)
    OR (correction_item_id IS NULL AND (
      (kind::text = 'SALE_OUT' AND quantity_delta < 0 AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL)
      OR (sale_item_id IS NULL AND (
        (kind::text = 'RECEIPT' AND quantity_delta > 0 AND purchase_item_id IS NOT NULL)
        OR (kind::text = 'RECEIPT_REVERSAL' AND quantity_delta < 0 AND purchase_item_id IS NOT NULL AND reason IS NOT NULL)
        OR (kind::text = 'ADJUST_IN' AND quantity_delta > 0 AND operation_key IS NOT NULL AND operation_digest IS NOT NULL AND reason IS NOT NULL)
        OR (kind::text = 'ADJUST_OUT' AND quantity_delta < 0 AND operation_key IS NOT NULL AND operation_digest IS NOT NULL AND reason IS NOT NULL)
      ))
    ))
  ))
);
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source_valid";
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_valid" CHECK (
  num_nonnulls(payment_id, sale_tender_id, layaway_payment_id, correction_tender_id) = 1 AND (
    (kind::text IN ('SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_REVERSAL') AND payment_id IS NOT NULL)
    OR (kind::text IN ('SALE_PAYMENT', 'SALE_CHANGE') AND sale_tender_id IS NOT NULL)
    OR (kind::text IN ('LAYAWAY_DEPOSIT','LAYAWAY_REFUND') AND layaway_payment_id IS NOT NULL)
    OR (kind::text IN ('EXCHANGE_PAYMENT','SALE_REFUND') AND correction_tender_id IS NOT NULL)
  )
);
ALTER TABLE "sales" ADD CONSTRAINT "sales_single_origin" CHECK (num_nonnulls(layaway_id, exchange_id) <= 1);
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_return_source" CHECK (
  (correction_item_id IS NULL) = (origin_lot_id IS NULL)
  AND (correction_item_id IS NULL OR purchase_item_id IS NULL)
);
ALTER TABLE "layaways" ADD CONSTRAINT "layaways_state_valid" CHECK (
  number > 0 AND total_usd > 0 AND paid_usd BETWEEN 0 AND total_usd
  AND (expires_at IS NULL OR expires_at > created_at)
  AND ((closed_at IS NULL) = (status IN ('ACTIVE','PAID')))
  AND (status <> 'ACTIVE' OR paid_usd < total_usd)
  AND (status NOT IN ('PAID','DELIVERED') OR paid_usd = total_usd)
);
ALTER TABLE "layaway_items" ADD CONSTRAINT "layaway_items_valid" CHECK (
  position >= 0 AND quantity > 0 AND unit_price_usd > 0 AND total_usd = quantity * unit_price_usd
);
ALTER TABLE "layaway_actions" ADD CONSTRAINT "layaway_actions_reason_valid" CHECK (
  (kind IN ('CANCEL', 'EXPIRE')) = (reason IS NOT NULL)
);
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_valid" CHECK (
  position >= 0 AND amount_original > 0 AND amount_usd > 0 AND units_per_usd > 0
  AND ((kind = 'REFUND') = (reversed_id IS NOT NULL))
  AND (CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL ELSE exchange_rate_id IS NOT NULL END)
);
ALTER TABLE "sale_corrections" ADD CONSTRAINT "sale_corrections_valid" CHECK (
  number > 0 AND returned_usd >= 0 AND restored_cogs_usd >= 0 AND replacement_total_usd >= 0
  AND (kind = 'EXCHANGE') = (replacement_total_usd > 0)
  AND difference_usd = replacement_total_usd - returned_usd
);
ALTER TABLE "sale_correction_items" ADD CONSTRAINT "sale_correction_items_valid" CHECK (
  position >= 0 AND quantity > 0 AND credit_usd >= 0 AND restored_cogs_usd >= 0
  AND (condition = 'SELLABLE' OR restored_cogs_usd = 0)
);
ALTER TABLE "correction_tenders" ADD CONSTRAINT "correction_tenders_valid" CHECK (
  position >= 0 AND amount_original > 0 AND amount_usd > 0 AND units_per_usd > 0
  AND (CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL ELSE exchange_rate_id IS NOT NULL END)
);

CREATE TRIGGER layaway_items_append_only BEFORE UPDATE OR DELETE ON "layaway_items"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER layaway_actions_append_only BEFORE UPDATE OR DELETE ON "layaway_actions"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER layaway_payments_append_only BEFORE UPDATE OR DELETE ON "layaway_payments"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER sale_corrections_append_only BEFORE UPDATE OR DELETE ON "sale_corrections"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER sale_correction_items_append_only BEFORE UPDATE OR DELETE ON "sale_correction_items"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER correction_tenders_append_only BEFORE UPDATE OR DELETE ON "correction_tenders"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();

INSERT INTO "permissions" ("id", "code", "label") VALUES
  (gen_random_uuid(), 'layaways.read', 'Consultar apartados'),
  (gen_random_uuid(), 'layaways.read.all', 'Consultar apartados de otros vendedores'),
  (gen_random_uuid(), 'layaways.create', 'Crear apartados'),
  (gen_random_uuid(), 'layaways.pay', 'Registrar abonos de apartados'),
  (gen_random_uuid(), 'layaways.deliver', 'Entregar apartados pagados'),
  (gen_random_uuid(), 'layaways.cancel', 'Cancelar o cerrar apartados vencidos'),
  (gen_random_uuid(), 'returns.read', 'Consultar cambios y devoluciones'),
  (gen_random_uuid(), 'returns.create', 'Autorizar cambios y devoluciones')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE p.code IN ('layaways.read', 'layaways.read.all', 'layaways.create', 'layaways.pay',
  'layaways.deliver', 'layaways.cancel', 'returns.read', 'returns.create') AND (
  r.code IN ('ADMIN','MANAGER')
  OR (r.code = 'SELLER' AND p.code IN ('layaways.read','layaways.create','layaways.pay','layaways.deliver','returns.read'))
  OR (r.code = 'FINANCE' AND p.code IN ('layaways.read','layaways.read.all','returns.read')))
ON CONFLICT DO NOTHING;
