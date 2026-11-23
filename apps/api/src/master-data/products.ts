import { brandInput, modelInput, variantInput } from '@max-sport/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import type { CatalogDefinition } from './catalog.js';
import { buildPage, filterActive, insensitive, normalizedKey, pageArgs } from './catalog.js';
import { HttpError } from '../http/errors.js';

const brandSelect = { id: true, name: true, active: true } satisfies Prisma.BrandSelect;
const reference = { id: true, name: true } as const;
const modelSelect = {
  id: true,
  active: true,
  name: true,
  description: true,
  brandId: true,
  brand: { select: reference },
} satisfies Prisma.ProductModelSelect;
const variantSelect = {
  id: true,
  active: true,
  modelId: true,
  model: { select: { ...reference, brand: { select: reference } } },
  size: true,
  sku: true,
  color: true,
  salePriceUsd: true,
  lowStockThreshold: true,
} satisfies Prisma.ProductVariantSelect;

type Brand = Prisma.BrandGetPayload<{ select: typeof brandSelect }>;
type Model = Prisma.ProductModelGetPayload<{ select: typeof modelSelect }>;
type RawVariant = Prisma.ProductVariantGetPayload<{ select: typeof variantSelect }>;
type Variant = Omit<RawVariant, 'salePriceUsd'> & { salePriceUsd: string };

function variantDto(row: RawVariant): Variant {
  return { ...row, salePriceUsd: row.salePriceUsd.toFixed(2) };
}

function nameKey(name: string, max: number) {
  const key = normalizedKey(name);
  if (!key || key.length > max)
    throw new HttpError(400, 'INVALID_NAME', 'El nombre normalizado no es válido.');
  return key;
}

export const brands: CatalogDefinition<z.output<typeof brandInput>, Brand> = {
  entity: 'Brand',
  schema: brandInput,
  list(db, query) {
    const where = {
      ...filterActive(query.status),
      ...(query.q ? { name: insensitive(query.q) } : {}),
    };
    return buildPage(
      db.brand.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: brandSelect,
      }),
      db.brand.count({ where }),
    );
  },
  find: (db, id) => db.brand.findUnique({ where: { id }, select: brandSelect }),
  create: (db, { name }) =>
    db.brand.create({ data: { name, nameKey: nameKey(name, 120) }, select: brandSelect }),
  update: (db, id, { name }) =>
    db.brand.update({
      where: { id },
      data: { name, nameKey: nameKey(name, 120) },
      select: brandSelect,
    }),
  setActive: (db, id, active) =>
    db.brand.update({ where: { id }, data: { active }, select: brandSelect }),
  audit: ({ name, active }) => ({ name, active }),
};

export const models: CatalogDefinition<z.output<typeof modelInput>, Model> = {
  entity: 'ProductModel',
  schema: modelInput,
  list(db, query) {
    const where: Prisma.ProductModelWhereInput = {
      ...filterActive(query.status),
      ...(query.q
        ? { OR: [{ name: insensitive(query.q) }, { brand: { name: insensitive(query.q) } }] }
        : {}),
    };
    return buildPage(
      db.productModel.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: modelSelect,
      }),
      db.productModel.count({ where }),
    );
  },
  find: (db, id) => db.productModel.findUnique({ where: { id }, select: modelSelect }),
  create: (db, input) =>
    db.productModel.create({
      data: { ...input, nameKey: nameKey(input.name, 140) },
      select: modelSelect,
    }),
  update: (db, id, input) =>
    db.productModel.update({
      where: { id },
      data: { ...input, nameKey: nameKey(input.name, 140) },
      select: modelSelect,
    }),
  setActive: (db, id, active) =>
    db.productModel.update({ where: { id }, data: { active }, select: modelSelect }),
  audit: ({ name, brandId, active }) => ({ name, brandId, active }),
};

function variantData(input: z.output<typeof variantInput>) {
  return { ...input, colorKey: input.color ? nameKey(input.color, 80) : '' };
}

async function checkSku(db: Prisma.TransactionClient, sku: string, id?: string) {
  const existing = await db.productVariant.findFirst({
    where: { sku: { equals: sku, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, 'SKU_EXISTS', 'Ya existe una variante con ese SKU.');
}

export const variants: CatalogDefinition<z.output<typeof variantInput>, Variant> = {
  entity: 'ProductVariant',
  schema: variantInput,
  async list(db, query) {
    const where: Prisma.ProductVariantWhereInput = {
      ...filterActive(query.status),
      ...(query.q
        ? {
            OR: [
              { sku: insensitive(query.q) },
              { model: { name: insensitive(query.q) } },
              { model: { brand: { name: insensitive(query.q) } } },
              ...(/^(?:2[89]|3\d|4[0-4])$/.test(query.q) ? [{ size: Number(query.q) }] : []),
            ],
          }
        : {}),
    };
    const { items, total } = await buildPage(
      db.productVariant.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ model: { name: 'asc' } }, { size: 'asc' }, { id: 'asc' }],
        select: variantSelect,
      }),
      db.productVariant.count({ where }),
    );
    return { items: items.map(variantDto), total };
  },
  async find(db, id) {
    const item = await db.productVariant.findUnique({ where: { id }, select: variantSelect });
    return item && variantDto(item);
  },
  async create(db, input) {
    await checkSku(db, input.sku);
    return variantDto(
      await db.productVariant.create({ data: variantData(input), select: variantSelect }),
    );
  },
  async update(db, id, input) {
    const data = variantData(input);
    const current = await db.productVariant.findUniqueOrThrow({
      where: { id },
      select: { modelId: true, size: true, colorKey: true },
    });
    if (
      current.modelId !== data.modelId ||
      current.size !== data.size ||
      current.colorKey !== data.colorKey
    ) {
      const posted = await db.stockMovement.findFirst({
        where: { variantId: id },
        select: { id: true },
      });
      if (posted) {
        throw new HttpError(
          409,
          'VARIANT_IDENTITY_LOCKED',
          'La variante ya tiene movimientos. Crea otra variante para el modelo, talla o color nuevos.',
        );
      }
    }
    await checkSku(db, input.sku, id);
    return variantDto(
      await db.productVariant.update({
        where: { id },
        data,
        select: variantSelect,
      }),
    );
  },
  async setActive(db, id, active) {
    return variantDto(
      await db.productVariant.update({ where: { id }, data: { active }, select: variantSelect }),
    );
  },
  audit: ({ modelId, size, sku, color, lowStockThreshold, salePriceUsd, active }) => ({
    modelId,
    size,
    sku,
    color,
    lowStockThreshold,
    salePriceUsd,
    active,
  }),
};
