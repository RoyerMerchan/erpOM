BEGIN;

-- CreateEnum
CREATE TYPE "SaleTenderKind" AS ENUM ('PAYMENT', 'CHANGE');

-- CreateEnum
CREATE TYPE "SaleDiscountKind" AS ENUM ('PERCENT', 'FIXED');

-- AlterEnum
ALTER TYPE "StockMovementKind" ADD VALUE 'SALE_OUT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierMoneyKind" ADD VALUE 'SALE_PAYMENT';
ALTER TYPE "SupplierMoneyKind" ADD VALUE 'SALE_CHANGE';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "sale_item_id" UUID;

-- AlterTable
ALTER TABLE "money_movements" ADD COLUMN     "sale_tender_id" UUID,
ALTER COLUMN "payment_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "receipt_number" BIGSERIAL NOT NULL,
    "operation_key" UUID NOT NULL,
    "operation_digest" CHAR(64) NOT NULL,
    "customer_id" UUID,
    "customer_name" VARCHAR(160) NOT NULL,
    "shop_name" VARCHAR(160) NOT NULL,
    "seller_id" UUID NOT NULL,
    "seller_name" VARCHAR(120) NOT NULL,
    "actor_id" UUID NOT NULL,
    "notes" TEXT,
    "subtotal_usd" DECIMAL(48,2) NOT NULL,
    "discount_usd" DECIMAL(48,2) NOT NULL,
    "total_usd" DECIMAL(48,2) NOT NULL,
    "cogs_usd" DECIMAL(48,2) NOT NULL,
    "gross_profit_usd" DECIMAL(48,2) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "brand_name" VARCHAR(120) NOT NULL,
    "model_name" VARCHAR(140) NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "size" SMALLINT NOT NULL,
    "color" VARCHAR(80),
    "quantity" INTEGER NOT NULL,
    "unit_price_usd" DECIMAL(18,2) NOT NULL,
    "gross_usd" DECIMAL(48,2) NOT NULL,
    "line_discount_usd" DECIMAL(48,2) NOT NULL,
    "global_discount_usd" DECIMAL(48,2) NOT NULL,
    "net_usd" DECIMAL(48,2) NOT NULL,
    "cogs_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_discounts" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sale_item_id" UUID,
    "kind" "SaleDiscountKind" NOT NULL,
    "percentage" DECIMAL(7,4),
    "currency_code" VARCHAR(5),
    "amount_original" DECIMAL(38,8),
    "units_per_usd" DECIMAL(30,12),
    "exchange_rate_id" UUID,
    "amount_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "sale_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_tenders" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "kind" "SaleTenderKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "exchange_rate_id" UUID,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "amount_original" DECIMAL(38,8) NOT NULL,
    "amount_usd" DECIMAL(48,2) NOT NULL,
    "reference" VARCHAR(120),

    CONSTRAINT "sale_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_receipt_number_key" ON "sales"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_operation_key_key" ON "sales"("operation_key");

-- CreateIndex
CREATE INDEX "sales_confirmed_at_id_idx" ON "sales"("confirmed_at", "id");

-- CreateIndex
CREATE INDEX "sales_seller_id_confirmed_at_idx" ON "sales"("seller_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "sales_customer_id_confirmed_at_idx" ON "sales"("customer_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "sale_items_variant_id_idx" ON "sale_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_position_key" ON "sale_items"("sale_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_variant_id_key" ON "sale_items"("sale_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_discounts_sale_item_id_key" ON "sale_discounts"("sale_item_id");

-- CreateIndex
CREATE INDEX "sale_discounts_sale_id_idx" ON "sale_discounts"("sale_id");

-- CreateIndex
CREATE INDEX "sale_tenders_account_id_idx" ON "sale_tenders"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_tenders_sale_id_position_key" ON "sale_tenders"("sale_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_sale_item_id_key" ON "stock_movements"("sale_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "money_movements_sale_tender_id_key" ON "money_movements"("sale_tender_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_sale_tender_id_fkey" FOREIGN KEY ("sale_tender_id") REFERENCES "sale_tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tenders" ADD CONSTRAINT "sale_tenders_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tenders" ADD CONSTRAINT "sale_tenders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tenders" ADD CONSTRAINT "sale_tenders_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_tenders" ADD CONSTRAINT "sale_tenders_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_source_valid";
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_source_valid" CHECK (
  (kind::text = 'SALE_OUT' AND quantity_delta < 0 AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL)
  OR (sale_item_id IS NULL AND (
    (kind::text = 'RECEIPT' AND quantity_delta > 0 AND purchase_item_id IS NOT NULL)
    OR (kind::text = 'RECEIPT_REVERSAL' AND quantity_delta < 0 AND purchase_item_id IS NOT NULL AND reason IS NOT NULL)
    OR (kind::text = 'ADJUST_IN' AND quantity_delta > 0 AND operation_key IS NOT NULL AND operation_digest IS NOT NULL AND reason IS NOT NULL)
    OR (kind::text = 'ADJUST_OUT' AND quantity_delta < 0 AND operation_key IS NOT NULL AND operation_digest IS NOT NULL AND reason IS NOT NULL)
  ))
);
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source_valid" CHECK (
  (kind::text IN ('SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_REVERSAL') AND payment_id IS NOT NULL AND sale_tender_id IS NULL)
  OR (kind::text IN ('SALE_PAYMENT', 'SALE_CHANGE') AND payment_id IS NULL AND sale_tender_id IS NOT NULL)
);
ALTER TABLE "sales" ADD CONSTRAINT "sales_totals_valid" CHECK (
  receipt_number > 0 AND subtotal_usd > 0 AND discount_usd >= 0 AND total_usd >= 0
  AND total_usd = subtotal_usd - discount_usd
  AND cogs_usd >= 0 AND gross_profit_usd = total_usd - cogs_usd
);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_totals_valid" CHECK (
  position >= 0 AND quantity > 0 AND unit_price_usd > 0 AND gross_usd = unit_price_usd * quantity
  AND line_discount_usd >= 0 AND global_discount_usd >= 0 AND cogs_usd >= 0
  AND net_usd >= 0 AND net_usd = gross_usd - line_discount_usd - global_discount_usd
);
ALTER TABLE "sale_discounts" ADD CONSTRAINT "sale_discounts_snapshot_valid" CHECK (
  amount_usd >= 0 AND (
    (kind = 'PERCENT' AND percentage BETWEEN 0.0001 AND 100 AND currency_code IS NULL
      AND amount_original IS NULL AND units_per_usd IS NULL AND exchange_rate_id IS NULL)
    OR (kind = 'FIXED' AND percentage IS NULL AND currency_code IS NOT NULL
      AND amount_original IS NOT NULL AND amount_original > 0 AND units_per_usd IS NOT NULL AND units_per_usd > 0
      AND (CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL ELSE exchange_rate_id IS NOT NULL END))
  )
);
ALTER TABLE "sale_tenders" ADD CONSTRAINT "sale_tenders_snapshot_valid" CHECK (
  position >= 0 AND amount_original > 0 AND amount_usd > 0 AND units_per_usd > 0
  AND (CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL ELSE exchange_rate_id IS NOT NULL END)
);
CREATE UNIQUE INDEX "sale_discounts_global_key" ON "sale_discounts"("sale_id") WHERE sale_item_id IS NULL;
CREATE UNIQUE INDEX "sale_single_change_key" ON "sale_tenders"("sale_id") WHERE kind = 'CHANGE';

CREATE TRIGGER sales_append_only BEFORE UPDATE OR DELETE ON "sales"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER sale_items_append_only BEFORE UPDATE OR DELETE ON "sale_items"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER sale_discounts_append_only BEFORE UPDATE OR DELETE ON "sale_discounts"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER sale_tenders_append_only BEFORE UPDATE OR DELETE ON "sale_tenders"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();

INSERT INTO "permissions" ("id", "code", "label") VALUES
  (gen_random_uuid(), 'sales.read', 'Consultar ventas'),
  (gen_random_uuid(), 'sales.read.all', 'Consultar ventas de otros vendedores'),
  (gen_random_uuid(), 'sales.create', 'Registrar ventas en el POS'),
  (gen_random_uuid(), 'sales.assign', 'Asignar otra persona como vendedor'),
  (gen_random_uuid(), 'sales.discount', 'Aplicar descuentos en ventas')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM (VALUES
  ('ADMIN', 'sales.read'),
  ('ADMIN', 'sales.read.all'),
  ('ADMIN', 'sales.create'),
  ('ADMIN', 'sales.assign'),
  ('ADMIN', 'sales.discount'),
  ('MANAGER', 'sales.read'),
  ('MANAGER', 'sales.read.all'),
  ('MANAGER', 'sales.create'),
  ('MANAGER', 'sales.assign'),
  ('MANAGER', 'sales.discount'),
  ('SELLER', 'sales.read'),
  ('SELLER', 'sales.create'),
  ('SELLER', 'sales.discount'),
  ('FINANCE', 'sales.read'),
  ('FINANCE', 'sales.read.all')
) AS grants(role_code, permission_code)
JOIN "roles" r ON r.code = grants.role_code
JOIN "permissions" p ON p.code = grants.permission_code
ON CONFLICT DO NOTHING;

COMMIT;
