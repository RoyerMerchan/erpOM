-- CreateTable
CREATE TABLE "catalog_exports" (
    "id" UUID NOT NULL,
    "operation_key" UUID NOT NULL,
    "operation_digest" CHAR(64) NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_name" VARCHAR(120) NOT NULL,
    "shop_name" VARCHAR(160) NOT NULL,
    "filename" VARCHAR(120) NOT NULL,
    "brand" VARCHAR(120),
    "model" VARCHAR(140),
    "size" SMALLINT,
    "include_quantity" BOOLEAN NOT NULL,
    "currency_code" VARCHAR(5) NOT NULL,
    "units_per_usd" DECIMAL(30,12) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "product_count" INTEGER NOT NULL,
    "byte_count" INTEGER NOT NULL,
    "pdf" BYTEA NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_exports_operation_key_key" ON "catalog_exports"("operation_key");

-- CreateIndex
CREATE INDEX "catalog_exports_generated_at_id_idx" ON "catalog_exports"("generated_at", "id");

-- CreateIndex
CREATE INDEX "catalog_exports_actor_id_generated_at_idx" ON "catalog_exports"("actor_id", "generated_at");

-- AddForeignKey
ALTER TABLE "catalog_exports" ADD CONSTRAINT "catalog_exports_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_exports" ADD CONSTRAINT "catalog_exports_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalog_exports" ADD CONSTRAINT "catalog_exports_terms_valid" CHECK (
  product_count >= 0 AND byte_count = octet_length(pdf) AND byte_count > 0
  AND (size IS NULL OR size BETWEEN 28 AND 44)
  AND units_per_usd > 0 AND (currency_code <> 'USD' OR units_per_usd = 1)
);
CREATE TRIGGER catalog_exports_append_only BEFORE UPDATE OR DELETE ON "catalog_exports"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();

INSERT INTO "permissions" ("id", "code", "label") VALUES
  (gen_random_uuid(), 'analytics.read', 'Consultar panel y reportes'),
  (gen_random_uuid(), 'analytics.export', 'Exportar reportes autorizados'),
  (gen_random_uuid(), 'catalog.export', 'Generar y guardar catálogos PDF'),
  (gen_random_uuid(), 'catalog.quantity', 'Incluir cantidades en el catálogo'),
  (gen_random_uuid(), 'catalog.history.all', 'Consultar versiones de catálogo de otros usuarios')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id FROM "roles" r CROSS JOIN "permissions" p
WHERE p.code IN ('analytics.read','analytics.export','catalog.export','catalog.quantity','catalog.history.all')
  AND (r.code IN ('ADMIN','MANAGER')
    OR (r.code = 'SELLER' AND p.code IN ('analytics.read','catalog.export'))
    OR (r.code = 'INVENTORY' AND p.code IN ('analytics.read','analytics.export','catalog.export','catalog.quantity'))
    OR (r.code = 'FINANCE' AND p.code IN ('analytics.read','analytics.export','catalog.export')))
ON CONFLICT DO NOTHING;
