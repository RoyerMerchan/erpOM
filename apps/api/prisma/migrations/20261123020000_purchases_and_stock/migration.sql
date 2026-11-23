BEGIN;

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('RECEIPT', 'RECEIPT_REVERSAL', 'ADJUST_IN', 'ADJUST_OUT');

-- CreateEnum
CREATE TYPE "SupplierMoneyKind" AS ENUM ('SUPPLIER_PAYMENT', 'SUPPLIER_PAYMENT_REVERSAL');

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "supplier_id" UUID NOT NULL,
    "document_at" TIMESTAMPTZ(3) NOT NULL,
    "reference" VARCHAR(120),
    "notes" TEXT,
    "currency_code" VARCHAR(5) NOT NULL,
    "minor_units" SMALLINT NOT NULL,
    "exchange_rate_id" UUID,
    "units_per_usd" DECIMAL(30,12),
    "draft_data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "subtotal_original" DECIMAL(38,8) NOT NULL,
    "freight_original" DECIMAL(38,8) NOT NULL,
    "total_original" DECIMAL(38,8) NOT NULL,
    "total_usd" DECIMAL(48,2),
    "paid_usd" DECIMAL(48,2) NOT NULL DEFAULT 0,
    "pair_count" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "received_by_id" UUID,
    "voided_by_id" UUID,
    "received_at" TIMESTAMPTZ(3),
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" TEXT,
    "confirmation_key" UUID,
    "confirmation_digest" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "brand_name" VARCHAR(120) NOT NULL,
    "model_name" VARCHAR(140) NOT NULL,
    "size" SMALLINT NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "color" VARCHAR(80),
    "quantity" INTEGER NOT NULL,
    "sale_price_usd" DECIMAL(18,2) NOT NULL,
    "unit_cost_original" DECIMAL(38,8) NOT NULL,
    "freight_original" DECIMAL(38,8) NOT NULL,
    "total_original" DECIMAL(38,8) NOT NULL,
    "total_usd" DECIMAL(48,2) NOT NULL,
    "unit_cost_usd" DECIMAL(56,12) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "variant_id" UUID NOT NULL,
    "physical" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "purchase_item_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "initial_quantity" INTEGER NOT NULL,
    "remaining_quantity" INTEGER NOT NULL,
    "unit_cost_usd" DECIMAL(56,12) NOT NULL,
    "total_cost_usd" DECIMAL(48,2) NOT NULL,
    "remaining_cost_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "purchase_item_id" UUID,
    "kind" "StockMovementKind" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "reason" TEXT,
    "operation_key" UUID,
    "operation_digest" CHAR(64),
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lot_allocations" (
    "movement_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_usd" DECIMAL(48,2) NOT NULL,

    CONSTRAINT "stock_lot_allocations_pkey" PRIMARY KEY ("movement_id","lot_id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "exchange_rate_id" UUID,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "amount_original" DECIMAL(38,8) NOT NULL,
    "amount_usd" DECIMAL(48,2) NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "reference" VARCHAR(120),
    "operation_key" UUID NOT NULL,
    "operation_digest" CHAR(64) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(3),
    "reversed_by_id" UUID,
    "reversal_reason" TEXT,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_movements" (
    "id" UUID NOT NULL,
    "kind" "SupplierMoneyKind" NOT NULL,
    "payment_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "amount_original" DECIMAL(38,8) NOT NULL,
    "amount_usd" DECIMAL(48,2) NOT NULL,
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "money_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchases_status_document_at_idx" ON "purchases"("status", "document_at");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_document_at_idx" ON "purchases"("supplier_id", "document_at");

-- CreateIndex
CREATE INDEX "purchase_items_variant_id_idx" ON "purchase_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_purchase_id_variant_id_key" ON "purchase_items"("purchase_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_purchase_id_position_key" ON "purchase_items"("purchase_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lots_purchase_item_id_key" ON "inventory_lots"("purchase_item_id");

-- CreateIndex
CREATE INDEX "inventory_lots_variant_id_received_at_id_idx" ON "inventory_lots"("variant_id", "received_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_operation_key_key" ON "stock_movements"("operation_key");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_occurred_at_idx" ON "stock_movements"("variant_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_purchase_item_id_kind_key" ON "stock_movements"("purchase_item_id", "kind");

-- CreateIndex
CREATE INDEX "stock_lot_allocations_lot_id_idx" ON "stock_lot_allocations"("lot_id");

-- CreateIndex
CREATE INDEX "supplier_payments_account_id_paid_at_idx" ON "supplier_payments"("account_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_purchase_id_operation_key_key" ON "supplier_payments"("purchase_id", "operation_key");

-- CreateIndex
CREATE INDEX "money_movements_account_id_occurred_at_idx" ON "money_movements"("account_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "money_movements_payment_id_kind_key" ON "money_movements"("payment_id", "kind");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot_allocations" ADD CONSTRAINT "stock_lot_allocations_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lot_allocations" ADD CONSTRAINT "stock_lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "money_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_totals_valid" CHECK (
    minor_units BETWEEN 0 AND 8 AND pair_count > 0 AND revision > 0
    AND subtotal_original > 0 AND freight_original >= 0 AND total_original = subtotal_original + freight_original
    AND paid_usd >= 0 AND paid_usd <= COALESCE(total_usd, 0)
  ),
  ADD CONSTRAINT "purchases_status_valid" CHECK (
    (received_at IS NULL) = (received_by_id IS NULL)
    AND (received_at IS NULL) = (confirmation_key IS NULL)
    AND (received_at IS NULL) = (confirmation_digest IS NULL)
    AND (status <> 'CONFIRMED' OR received_at IS NOT NULL)
    AND (status <> 'DRAFT' OR received_at IS NULL)
    AND (status = 'VOIDED') = (voided_at IS NOT NULL AND voided_by_id IS NOT NULL AND void_reason IS NOT NULL)
  ),
  ADD CONSTRAINT "purchases_quote_valid" CHECK (
    received_at IS NULL OR (
      total_usd IS NOT NULL AND units_per_usd IS NOT NULL AND units_per_usd > 0
      AND (CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL
        ELSE exchange_rate_id IS NOT NULL END)
    )
  );
ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_amounts_valid" CHECK (
    quantity > 0 AND unit_cost_original > 0 AND sale_price_usd > 0 AND total_usd >= 0
    AND freight_original >= 0 AND total_original = unit_cost_original * quantity + freight_original AND unit_cost_usd >= 0
  );
ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_valid" CHECK (reserved >= 0 AND physical >= reserved);
ALTER TABLE "inventory_lots"
  ADD CONSTRAINT "inventory_lots_quantities_valid" CHECK (
    initial_quantity > 0 AND remaining_quantity BETWEEN 0 AND initial_quantity
    AND unit_cost_usd >= 0 AND remaining_cost_usd BETWEEN 0 AND total_cost_usd
    AND (remaining_quantity <> 0 OR remaining_cost_usd = 0)
  );
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_source_valid" CHECK (
    (kind = 'RECEIPT' AND quantity_delta > 0 AND purchase_item_id IS NOT NULL)
    OR (kind = 'RECEIPT_REVERSAL' AND quantity_delta < 0 AND purchase_item_id IS NOT NULL AND reason IS NOT NULL)
    OR (kind = 'ADJUST_IN' AND quantity_delta > 0 AND operation_key IS NOT NULL AND operation_digest IS NOT NULL AND reason IS NOT NULL)
    OR (kind = 'ADJUST_OUT' AND quantity_delta < 0 AND operation_key IS NOT NULL AND operation_digest IS NOT NULL AND reason IS NOT NULL)
  );
ALTER TABLE "stock_lot_allocations"
  ADD CONSTRAINT "stock_lot_allocations_valid" CHECK (quantity > 0 AND cost_usd >= 0);
ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_amounts_valid" CHECK (amount_original > 0 AND amount_usd > 0 AND units_per_usd > 0),
  ADD CONSTRAINT "supplier_payments_quote_valid" CHECK (
    CASE WHEN currency_code = 'USD' THEN units_per_usd = 1 AND exchange_rate_id IS NULL ELSE exchange_rate_id IS NOT NULL END
  ),
  ADD CONSTRAINT "supplier_payments_reversal_valid" CHECK (
    (reversed_at IS NULL) = (reversed_by_id IS NULL) AND (reversed_at IS NULL) = (reversal_reason IS NULL)
  );
ALTER TABLE "money_movements"
  ADD CONSTRAINT "money_movements_amounts_valid" CHECK (amount_original > 0 AND amount_usd > 0 AND units_per_usd > 0);

CREATE FUNCTION reject_posted_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Posted records are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER stock_allocations_append_only BEFORE UPDATE OR DELETE ON "stock_lot_allocations"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER supplier_ledger_append_only BEFORE UPDATE OR DELETE ON "money_movements"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
CREATE TRIGGER purchase_items_append_only BEFORE UPDATE OR DELETE ON "purchase_items"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();

INSERT INTO "permissions" ("id", "code", "label") VALUES
  (gen_random_uuid(), 'purchases.read', 'Consultar compras'),
  (gen_random_uuid(), 'purchases.create', 'Crear compras'),
  (gen_random_uuid(), 'purchases.update', 'Editar borradores de compra'),
  (gen_random_uuid(), 'purchases.confirm', 'Confirmar recepción de mercancía'),
  (gen_random_uuid(), 'purchases.void', 'Anular compras'),
  (gen_random_uuid(), 'purchases.pay', 'Registrar y revertir pagos a proveedores'),
  (gen_random_uuid(), 'inventory.read', 'Consultar existencias'),
  (gen_random_uuid(), 'inventory.adjust', 'Ajustar existencias')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM (VALUES
  ('ADMIN', 'purchases.read'),
  ('ADMIN', 'purchases.create'),
  ('ADMIN', 'purchases.update'),
  ('ADMIN', 'purchases.confirm'),
  ('ADMIN', 'purchases.void'),
  ('ADMIN', 'purchases.pay'),
  ('ADMIN', 'inventory.read'),
  ('ADMIN', 'inventory.adjust'),
  ('MANAGER', 'purchases.read'),
  ('MANAGER', 'purchases.create'),
  ('MANAGER', 'purchases.update'),
  ('MANAGER', 'purchases.confirm'),
  ('MANAGER', 'purchases.void'),
  ('MANAGER', 'purchases.pay'),
  ('MANAGER', 'inventory.read'),
  ('MANAGER', 'inventory.adjust'),
  ('SELLER', 'inventory.read'),
  ('INVENTORY', 'purchases.read'),
  ('INVENTORY', 'purchases.create'),
  ('INVENTORY', 'purchases.update'),
  ('INVENTORY', 'purchases.confirm'),
  ('INVENTORY', 'inventory.read'),
  ('INVENTORY', 'inventory.adjust'),
  ('FINANCE', 'purchases.read'),
  ('FINANCE', 'purchases.pay'),
  ('FINANCE', 'inventory.read')
) AS grants(role_code, permission_code)
JOIN "roles" r ON r.code = grants.role_code
JOIN "permissions" p ON p.code = grants.permission_code
ON CONFLICT DO NOTHING;

COMMIT;
