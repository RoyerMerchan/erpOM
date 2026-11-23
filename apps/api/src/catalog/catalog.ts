import { currencyCodeSchema } from '@max-sport/shared';
import type {
  CatalogInput,
  CatalogPdfInput,
  CatalogPreview,
  CatalogVersion,
  ListQuery,
  SessionUser,
} from '@max-sport/shared';
import { filterVariants } from '../analytics/filters.js';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import { makePdf } from '../exports/pdf.js';
import { calendarDate } from '../finance/calendar.js';
import { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { requireActiveCurrency } from '../master-data/accounts.js';
import { buildPage, insensitive, pageArgs } from '../master-data/catalog.js';
import { decimal, requiredRate } from '../purchasing/money.js';
import { digest, operation } from '../purchasing/transaction.js';
import type { Transaction } from '../purchasing/transaction.js';

function allowQuantity(includeQuantity: boolean, actor: SessionUser) {
  if (includeQuantity && !actor.permissions.includes('catalog.quantity'))
    throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite exportar cantidades exactas.');
}
type Group = CatalogPreview['items'][number];
type Variant = {
  brand: string;
  model: string;
  modelId: string;
  description: string | null;
  color: string | null;
  size: number;
  available: number;
  price: Prisma.Decimal;
};

export async function catalogData(tx: Transaction, input: CatalogInput, actor: SessionUser) {
  allowQuantity(input.includeQuantity, actor);
  const shop = await tx.shopSettings.findUnique({
    where: { id: 1 },
    select: { name: true, timezone: true },
  });
  if (!shop)
    throw new HttpError(409, 'SHOP_REQUIRED', 'Configura la tienda para generar el catálogo.');
  const currency = await requireActiveCurrency(tx, input.currencyCode);
  const rate = requiredRate(input.currencyCode, input.unitsPerUsd);
  const variants = await tx.$queryRaw<Variant[]>`
    SELECT b.name AS brand, model.name AS model, model.id AS "modelId", model.description,
      v.color, v.size, i.physical - i.reserved AS available, v.sale_price_usd AS price
    FROM product_variants v JOIN product_models model ON model.id = v.model_id JOIN brands b ON b.id = model.brand_id
    JOIN inventory_balances i ON i.variant_id = v.id
    WHERE v.active AND model.active AND b.active AND i.physical > i.reserved ${filterVariants(input)}
    ORDER BY b.name, model.name, v.color NULLS FIRST, v.sale_price_usd, v.size, v.sku
  `;
  const groups = new Map<string, Group>();
  for (const variant of variants) {
    const priceUsd = variant.price.toFixed(2);
    const key = JSON.stringify([variant.modelId, variant.color, priceUsd]);
    let group = groups.get(key);
    if (!group) {
      group = {
        brand: variant.brand,
        model: variant.model,
        description: variant.description,
        color: variant.color,
        priceUsd,
        priceLocal:
          input.currencyCode === 'USD'
            ? null
            : decimal(variant.price).mul(rate).toFixed(currency.minorUnits),
        sizes: [],
      };
      groups.set(key, group);
    }
    group.sizes.push({
      size: variant.size,
      ...(input.includeQuantity ? { available: variant.available } : {}),
    });
  }
  const items = [...groups.values()];
  const generatedAt = new Date();
  return {
    items,
    total: items.length,
    includeQuantity: input.includeQuantity,
    shopName: shop.name,
    timezone: shop.timezone,
    currencyCode: input.currencyCode,
    unitsPerUsd: rate,
    generatedAt: generatedAt.toISOString(),
  } satisfies CatalogPreview;
}

function snapshot<T>(db: Database, work: (tx: Transaction) => Promise<T>) {
  return db.$transaction(work, { isolationLevel: 'RepeatableRead', timeout: 15_000 });
}
export function previewCatalog(
  db: Database,
  input: CatalogInput,
  actor: SessionUser,
  page: number,
  limit: number,
) {
  return snapshot(db, async (tx) => {
    const catalog = await catalogData(tx, input, actor);
    return { ...catalog, items: catalog.items.slice((page - 1) * limit, page * limit) };
  });
}

function money(value: string, currency: string) {
  const [whole, decimals] = value.split('.');
  return (
    (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/gu, '.') +
    (decimals ? ',' + decimals : '') +
    ' ' +
    currency
  );
}

export function catalogPdf(
  catalog: CatalogPreview,
  filters?: { brand?: string; model?: string; size?: number },
) {
  const date = new Intl.DateTimeFormat('es-VE', {
    timeZone: catalog.timezone,
    dateStyle: 'long',
  }).format(new Date(catalog.generatedAt));
  const currency =
    catalog.currencyCode === 'USD'
      ? 'Precios en USD'
      : '1 USD equivale a ' + money(catalog.unitsPerUsd, catalog.currencyCode);
  const selection = [
    filters?.brand,
    filters?.model,
    filters?.size && 'Talla ' + filters.size,
  ].filter(Boolean);
  return makePdf(
    {
      title: 'Catálogo disponible',
      shop: catalog.shopName,
      details: [date, currency, ...selection].join(' · '),
    },
    (layout) => {
      if (!catalog.items.length)
        layout.paragraph('Sin tallas disponibles para los filtros aplicados.');
      for (const item of catalog.items) {
        layout.catalogCard({
          title: item.model,
          caption: item.brand + (item.color ? ' · ' + item.color : ''),
          description: item.description,
          sizes:
            'Tallas  ' +
            item.sizes
              .map(
                ({ size, available }) =>
                  size.toString() +
                  (available === undefined ? '' : ' (' + available + ' disponibles)'),
              )
              .join('  ·  '),
          usd: money(item.priceUsd, 'USD'),
          local: item.priceLocal === null ? null : money(item.priceLocal, catalog.currencyCode),
        });
      }
    },
  );
}

const versionSelect = {
  id: true,
  actorName: true,
  shopName: true,
  filename: true,
  brand: true,
  model: true,
  size: true,
  currencyCode: true,
  unitsPerUsd: true,
  timezone: true,
  productCount: true,
  byteCount: true,
  includeQuantity: true,
  generatedAt: true,
} satisfies Prisma.CatalogExportSelect;
type RecordVersion = Prisma.CatalogExportGetPayload<{ select: typeof versionSelect }>;
function version(record: RecordVersion): CatalogVersion {
  return {
    ...record,
    currencyCode: currencyCodeSchema.parse(record.currencyCode),
    generatedAt: record.generatedAt.toISOString(),
    unitsPerUsd: record.unitsPerUsd.toFixed(),
  };
}

function versionScope(actor: SessionUser) {
  return {
    ...(actor.permissions.includes('catalog.history.all') ? {} : { actorId: actor.id }),
    ...(actor.permissions.includes('catalog.quantity') ? {} : { includeQuantity: false }),
  };
}
export async function catalogVersions(db: Database, actor: SessionUser, query: ListQuery) {
  const match = insensitive(query.q);
  const where: Prisma.CatalogExportWhereInput = {
    ...versionScope(actor),
    ...(query.q
      ? { OR: [{ filename: match }, { brand: match }, { model: match }, { actorName: match }] }
      : {}),
  };
  const page = await buildPage(
    db.catalogExport.findMany({
      where,
      select: versionSelect,
      ...pageArgs(query),
      orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
    }),
    db.catalogExport.count({ where }),
  );
  return { total: page.total, items: page.items.map(version) };
}

export async function storedCatalog(db: Database, actor: SessionUser, id: string) {
  const entry = await db.catalogExport.findFirst({
    where: { id, ...versionScope(actor) },
    select: { filename: true, pdf: true, id: true },
  });
  if (!entry)
    throw new HttpError(404, 'CATALOG_VERSION_NOT_FOUND', 'No se encontró la versión solicitada.');
  return entry;
}

async function prior(tx: Transaction, key: string, hash: string, actor: SessionUser) {
  const entry = await tx.catalogExport.findUnique({
    where: { operationKey: key },
    select: {
      id: true,
      actorId: true,
      operationDigest: true,
      filename: true,
      pdf: true,
      includeQuantity: true,
    },
  });
  if (!entry) return null;
  if (entry.actorId !== actor.id || entry.operationDigest !== hash)
    throw new HttpError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de operación ya se usó con otros datos.',
    );
  allowQuantity(entry.includeQuantity, actor);
  return entry;
}

export async function generateCatalog(db: Database, input: CatalogPdfInput, actor: SessionUser) {
  allowQuantity(input.includeQuantity, actor);
  const key = input.operationId;
  const hash = digest(input);
  if (input.save && key) {
    const found = await prior(db, key, hash, actor);
    if (found) return found;
  }
  const { data, brand, model } = await snapshot(db, async (tx) => {
    const data = await catalogData(tx, input, actor);
    const brand = input.brandId
      ? await tx.brand.findUnique({ where: { id: input.brandId }, select: { name: true } })
      : null;
    const model = input.modelId
      ? await tx.productModel.findUnique({ where: { id: input.modelId }, select: { name: true } })
      : null;
    return { data, brand, model };
  });
  const pdf = await catalogPdf(data, { brand: brand?.name, model: model?.name, size: input.size });
  const filename = 'catalogo-' + calendarDate(new Date(data.generatedAt), data.timezone) + '.pdf';
  if (!input.save || !key) return { id: null, filename, pdf };
  return operation(db, async (tx) => {
    const saved = await prior(tx, key, hash, actor);
    if (saved) return saved;
    const record = await tx.catalogExport.create({
      data: {
        operationKey: key,
        operationDigest: hash,
        actorId: actor.id,
        actorName: actor.displayName,
        shopName: data.shopName,
        filename,
        brand: brand?.name ?? null,
        model: model?.name ?? null,
        size: input.size,
        includeQuantity: data.includeQuantity,
        currencyCode: data.currencyCode,
        unitsPerUsd: data.unitsPerUsd,
        timezone: data.timezone,
        generatedAt: new Date(data.generatedAt),
        productCount: data.total,
        byteCount: pdf.byteLength,
        pdf: new Uint8Array(pdf),
      },
      select: { id: true, filename: true, pdf: true },
    });
    await writeAudit(tx, actor.id, {
      action: 'catalog.save',
      entity: 'CatalogExport',
      entityId: record.id,
      after: {
        currencyCode: data.currencyCode,
        productCount: data.total,
        includeQuantity: data.includeQuantity,
      },
    });
    return record;
  });
}
