import { randomUUID } from 'node:crypto';
import type { PermissionCode, PurchaseInput, SessionUser } from '@max-sport/shared';
import { writeAudit } from '../audit/write.js';
import { HttpError } from '../http/errors.js';
import { normalizedKey } from '../master-data/catalog.js';
import { lockVariants } from '../inventory/stock.js';
import type { Transaction } from './transaction.js';

type ModelChoice = PurchaseInput['groups'][number]['model'];
const modelSelect = {
  id: true,
  name: true,
  active: true,
  brand: { select: { name: true, active: true } },
} as const;
const variantSelect = { id: true, active: true, sku: true, salePriceUsd: true } as const;

function key(value: string, length: number) {
  const result = normalizedKey(value);
  if (!result || result.length > length)
    throw new HttpError(400, 'INVALID_NAME', 'El nombre normalizado no es válido.');
  return result;
}

function assertCatalogPermission(actor: SessionUser, permission: PermissionCode) {
  if (!actor.permissions.includes(permission)) {
    throw new HttpError(
      403,
      'PERMISSION_DENIED',
      'Tu rol no permite cambiar este elemento del catálogo.',
    );
  }
}

async function pickModel(tx: Transaction, input: ModelChoice, actor: SessionUser) {
  if (input.mode === 'existing') {
    const model = await tx.productModel.findUnique({
      where: { id: input.id },
      select: modelSelect,
    });
    if (!model?.active || !model.brand.active) {
      throw new HttpError(409, 'MODEL_INACTIVE', 'El modelo y la marca deben estar activos.');
    }
    return model;
  }

  const choice = input.brand;
  const nameKey = choice.mode === 'new' ? key(choice.name, 120) : '';
  let brand = await tx.brand.findUnique({
    where: choice.mode === 'existing' ? { id: choice.id } : { nameKey },
    select: { id: true, active: true },
  });
  if (!brand && choice.mode === 'new') {
    assertCatalogPermission(actor, 'brands.create');
    brand = await tx.brand.create({ data: { name: choice.name, nameKey } });
    await writeAudit(tx, actor.id, {
      action: 'brands.create',
      entity: 'Brand',
      entityId: brand.id,
      after: { name: choice.name },
    });
  }
  if (!brand?.active) throw new HttpError(409, 'BRAND_INACTIVE', 'Selecciona una marca activa.');

  const modelKey = key(input.name, 140);
  const model = await tx.productModel.findUnique({
    where: { brandId_nameKey: { brandId: brand.id, nameKey: modelKey } },
    select: modelSelect,
  });
  if (model) {
    if (!model.active)
      throw new HttpError(409, 'MODEL_INACTIVE', 'El modelo coincidente está archivado.');
    return model;
  }
  assertCatalogPermission(actor, 'models.create');
  const created = await tx.productModel.create({
    data: { brandId: brand.id, name: input.name, nameKey: modelKey },
    select: modelSelect,
  });
  await writeAudit(tx, actor.id, {
    action: 'models.create',
    entity: 'ProductModel',
    entityId: created.id,
    after: { name: created.name, brandId: brand.id },
  });
  return created;
}

export async function receiveVariants(
  tx: Transaction,
  groups: PurchaseInput['groups'],
  actor: SessionUser,
) {
  const picked = [];
  const variants = new Set<string>();
  for (const group of groups) {
    const model = await pickModel(tx, group.model, actor);
    const colorKey = group.color ? key(group.color, 80) : '';
    for (const line of [...group.lines].sort((a, b) => a.size - b.size)) {
      const identity = { modelId: model.id, size: line.size, colorKey };
      let variant = await tx.productVariant.findUnique({
        where: { modelId_size_colorKey: identity },
        select: variantSelect,
      });
      if (!variant) {
        assertCatalogPermission(actor, 'variants.create');
        variant = await tx.productVariant.create({
          data: {
            ...identity,
            color: group.color,
            sku: 'MS-' + randomUUID().toUpperCase(),
            salePriceUsd: line.salePriceUsd,
          },
          select: variantSelect,
        });
        await writeAudit(tx, actor.id, {
          action: 'variants.create',
          entity: 'ProductVariant',
          entityId: variant.id,
          after: {
            modelId: model.id,
            size: line.size,
            sku: variant.sku,
            salePriceUsd: variant.salePriceUsd.toFixed(2),
          },
        });
      }
      if (!variant.active)
        throw new HttpError(
          409,
          'VARIANT_INACTIVE',
          'Reactiva la variante archivada antes de recibir mercancía.',
        );
      if (variants.has(variant.id))
        throw new HttpError(
          400,
          'DUPLICATE_VARIANT',
          'Una variante aparece dos veces en esta compra.',
        );
      variants.add(variant.id);
      picked.push({
        variant,
        salePriceUsd: line.salePriceUsd,
        brandName: model.brand.name,
        modelName: model.name,
        color: group.color,
      });
    }
  }

  await lockVariants(tx, [...variants]);
  for (const entry of [...picked].sort((a, b) => a.variant.id.localeCompare(b.variant.id))) {
    const { variant, salePriceUsd } = entry;
    if (variant.salePriceUsd.eq(salePriceUsd)) continue;
    assertCatalogPermission(actor, 'variants.update');
    await tx.productVariant.update({ where: { id: variant.id }, data: { salePriceUsd } });
    await writeAudit(tx, actor.id, {
      action: 'variants.price.update',
      entity: 'ProductVariant',
      entityId: variant.id,
      before: { salePriceUsd: variant.salePriceUsd.toFixed(2) },
      after: { salePriceUsd },
    });
  }
  return picked;
}
