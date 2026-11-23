import {
  changePasswordInput,
  defaultRolePermissions,
  permissionDefinitions,
  rateInput,
  shopInput,
  variantInput,
} from '@max-sport/shared';
import { describe, expect, it } from 'vitest';

const effectiveAt = '2026-11-23T09:00:00-04:00';
const modelId = '2aba3494-5024-4f67-a3d0-b7742d3f9052';

describe('reglas de datos maestros', () => {
  it('valida la escala y conserva la tasa como cadena decimal', () => {
    const base = { currencyCode: 'COP', effectiveAt };
    expect(rateInput.parse({ ...base, unitsPerUsd: '4000.000000000001' }).unitsPerUsd).toBe(
      '4000.000000000001',
    );
    for (const invalid of [
      4000,
      '-1',
      '0.000000',
      '1.0000000000001',
      '1e3',
      '1234567890123456789',
    ]) {
      expect(rateInput.safeParse({ ...base, unitsPerUsd: invalid }).success).toBe(false);
    }
  });

  it('mantiene la base USD y requiere una tasa explícita para USDT', () => {
    expect(
      rateInput.safeParse({ currencyCode: 'USD', unitsPerUsd: '1.00', effectiveAt }).success,
    ).toBe(true);
    expect(
      rateInput.safeParse({ currencyCode: 'USD', unitsPerUsd: '1.01', effectiveAt }).success,
    ).toBe(false);
    expect(rateInput.safeParse({ currencyCode: 'USDT', effectiveAt }).success).toBe(false);
  });

  it('normaliza el SKU y limita tallas y precio de venta', () => {
    const valid = {
      modelId,
      size: 28,
      sku: ' xa-28 ',
      color: null,
      salePriceUsd: '19.99',
      lowStockThreshold: null,
    };
    expect(variantInput.parse(valid).sku).toBe('XA-28');
    expect(variantInput.safeParse({ ...valid, size: 44 }).success).toBe(true);
    for (const size of [27, 45, 39.5])
      expect(variantInput.safeParse({ ...valid, size }).success).toBe(false);
    expect(variantInput.safeParse({ ...valid, salePriceUsd: '0' }).success).toBe(false);
    expect(variantInput.safeParse({ ...valid, salePriceUsd: '10.555' }).success).toBe(false);
  });

  it('valida la zona horaria de la tienda', () => {
    const defaults = { name: 'MAX Sport', logoUrl: null, lowStockThreshold: 3 };
    expect(shopInput.safeParse({ ...defaults, timezone: 'America/Caracas' }).success).toBe(true);
    expect(shopInput.safeParse({ ...defaults, timezone: 'No/Existe' }).success).toBe(false);
  });

  it('exige que la nueva contraseña sea distinta a la actual', () => {
    expect(
      changePasswordInput.safeParse({
        currentPassword: 'misma-contrasena-001',
        newPassword: 'misma-contrasena-001',
      }).success,
    ).toBe(false);
  });
});

it('distingue acceso de ventas, inventario, finanzas y administración', () => {
  const { ADMIN, MANAGER, SELLER, INVENTORY, FINANCE } = defaultRolePermissions;
  expect(ADMIN).toEqual(permissionDefinitions.map(({ code }) => code));
  expect(MANAGER).toContain('shop.update');
  expect(MANAGER).not.toContain('users.update');
  expect(SELLER).toContain('customers.create');
  expect(SELLER).not.toContain('costs.read');
  expect(SELLER).not.toContain('profits.read');
  expect(INVENTORY).toContain('variants.update');
  expect(INVENTORY).not.toContain('rates.update');
  expect(FINANCE).toContain('rates.update');
  expect(FINANCE).not.toContain('variants.update');
});
