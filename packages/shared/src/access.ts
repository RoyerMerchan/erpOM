import { z } from 'zod';

export const resourceKeys = [
  'brands',
  'models',
  'variants',
  'customers',
  'suppliers',
  'accounts',
  'rates',
  'users',
] as const;
export type ResourceKey = (typeof resourceKeys)[number];

export const resourceNames: Record<ResourceKey, string> = {
  brands: 'marcas',
  models: 'modelos',
  variants: 'variantes',
  customers: 'clientes',
  suppliers: 'proveedores',
  accounts: 'cuentas',
  rates: 'tasas',
  users: 'usuarios',
};

const actionLabels = {
  read: 'Consultar',
  create: 'Crear',
  update: 'Editar',
  archive: 'Cambiar estado de',
};
type ResourceAction = keyof typeof actionLabels;
type ResourcePermission = `${ResourceKey}.${ResourceAction}`;

export function resourcePermission(
  resource: ResourceKey,
  action: ResourceAction,
): ResourcePermission {
  return `${resource}.${action}`;
}

const extraPermissions = {
  'shop.read': 'Consultar la tienda',
  'shop.update': 'Editar la tienda',
  'currencies.read': 'Consultar monedas',
  'currencies.update': 'Configurar monedas',
  'roles.read': 'Consultar roles',
  'roles.financial.update': 'Configurar acceso a costos y utilidad',
  'costs.read': 'Consultar costos',
  'profits.read': 'Consultar utilidad',
  'audit.read': 'Consultar auditoría',
  'purchases.read': 'Consultar compras',
  'purchases.create': 'Crear compras',
  'purchases.update': 'Editar borradores de compra',
  'purchases.confirm': 'Confirmar recepción de mercancía',
  'purchases.void': 'Anular compras',
  'purchases.pay': 'Registrar y revertir pagos a proveedores',
  'inventory.read': 'Consultar existencias',
  'inventory.adjust': 'Ajustar existencias',
  'sales.read': 'Consultar ventas',
  'sales.read.all': 'Consultar ventas de otros vendedores',
  'sales.create': 'Registrar ventas en el POS',
  'sales.assign': 'Asignar otra persona como vendedor',
  'sales.discount': 'Aplicar descuentos en ventas',
  'layaways.read': 'Consultar apartados',
  'layaways.read.all': 'Consultar apartados de otros vendedores',
  'layaways.create': 'Crear apartados',
  'layaways.pay': 'Registrar abonos de apartados',
  'layaways.deliver': 'Entregar apartados pagados',
  'layaways.cancel': 'Cancelar o cerrar apartados vencidos',
  'returns.read': 'Consultar cambios y devoluciones',
  'returns.create': 'Autorizar cambios y devoluciones',
  'finance.read': 'Consultar saldos y movimientos de finanzas',
  'finance.post': 'Registrar gastos, otros ingresos y transferencias',
  'finance.adjust': 'Registrar ajustes de cuenta',
  'finance.reverse': 'Revertir registros financieros',
  'finance.categories.manage': 'Configurar categorías de gasto',
  'analytics.read': 'Consultar panel y reportes',
  'analytics.export': 'Exportar reportes autorizados',
  'catalog.export': 'Generar y guardar catálogos PDF',
  'catalog.quantity': 'Incluir cantidades en el catálogo',
  'catalog.history.all': 'Consultar versiones de catálogo de otros usuarios',
} as const;

export type PermissionCode = ResourcePermission | keyof typeof extraPermissions;
export const permissionDefinitions: { code: PermissionCode; label: string }[] = [
  ...resourceKeys.flatMap((resource) =>
    (Object.keys(actionLabels) as ResourceAction[]).map((action) => ({
      code: resourcePermission(resource, action),
      label: `${actionLabels[action]} ${resourceNames[resource]}`,
    })),
  ),
  ...(Object.entries(extraPermissions) as [keyof typeof extraPermissions, string][]).map(
    ([code, label]) => ({ code, label }),
  ),
];

const codes = new Set<string>(permissionDefinitions.map(({ code }) => code));
export function isPermissionCode(value: string): value is PermissionCode {
  return codes.has(value);
}
export const permissionSchema = z.custom<PermissionCode>(
  (value) => typeof value === 'string' && isPermissionCode(value),
);

export const roleCodeSchema = z.enum(['ADMIN', 'MANAGER', 'SELLER', 'INVENTORY', 'FINANCE']);
export type RoleCode = z.infer<typeof roleCodeSchema>;
export const roleLabels: Record<RoleCode, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  SELLER: 'Vendedor',
  INVENTORY: 'Inventario',
  FINANCE: 'Finanzas',
};

const read = (...resources: ResourceKey[]) =>
  resources.map((resource) => resourcePermission(resource, 'read'));
const manage = (...resources: ResourceKey[]) =>
  permissionDefinitions
    .map(({ code }) => code)
    .filter((code) => resources.some((resource) => code.startsWith(`${resource}.`)));

const purchaseWork = [
  'purchases.read',
  'purchases.create',
  'purchases.update',
  'purchases.confirm',
] as const;

export const defaultRolePermissions: Record<RoleCode, PermissionCode[]> = {
  ADMIN: permissionDefinitions.map(({ code }) => code),
  MANAGER: [
    ...manage('brands', 'models', 'variants', 'customers', 'suppliers', 'accounts', 'rates'),
    ...purchaseWork,
    'purchases.void',
    'purchases.pay',
    'inventory.read',
    'inventory.adjust',
    'sales.read',
    'sales.read.all',
    'sales.create',
    'sales.assign',
    'sales.discount',
    'layaways.read',
    'layaways.read.all',
    'layaways.create',
    'layaways.pay',
    'layaways.deliver',
    'layaways.cancel',
    'returns.read',
    'returns.create',
    'finance.read',
    'finance.post',
    'finance.reverse',
    'finance.categories.manage',
    'analytics.read',
    'analytics.export',
    'catalog.export',
    'catalog.quantity',
    'catalog.history.all',
    'shop.read',
    'shop.update',
    'currencies.read',
    'currencies.update',
    'costs.read',
    'profits.read',
    'audit.read',
  ],
  SELLER: [
    ...read('brands', 'models', 'variants', 'accounts', 'rates', 'customers'),
    'customers.create',
    'customers.update',
    'inventory.read',
    'sales.read',
    'sales.create',
    'sales.discount',
    'layaways.read',
    'layaways.create',
    'layaways.pay',
    'layaways.deliver',
    'returns.read',
    'analytics.read',
    'catalog.export',
    'currencies.read',
    'shop.read',
  ],
  INVENTORY: [
    ...manage('brands', 'models', 'variants', 'suppliers'),
    ...read('rates'),
    ...purchaseWork,
    'inventory.read',
    'inventory.adjust',
    'analytics.read',
    'analytics.export',
    'catalog.export',
    'catalog.quantity',
    'currencies.read',
    'shop.read',
  ],
  FINANCE: [
    ...manage('accounts', 'rates'),
    ...read('suppliers'),
    'purchases.read',
    'purchases.pay',
    'inventory.read',
    'sales.read',
    'sales.read.all',
    'layaways.read',
    'layaways.read.all',
    'returns.read',
    'finance.read',
    'finance.post',
    'finance.adjust',
    'finance.reverse',
    'finance.categories.manage',
    'analytics.read',
    'analytics.export',
    'catalog.export',
    'shop.read',
    'currencies.read',
    'currencies.update',
    'costs.read',
    'profits.read',
    'audit.read',
  ],
};
