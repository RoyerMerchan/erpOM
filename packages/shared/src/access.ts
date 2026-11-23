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

export const defaultRolePermissions: Record<RoleCode, PermissionCode[]> = {
  ADMIN: permissionDefinitions.map(({ code }) => code),
  MANAGER: [
    ...manage('brands', 'models', 'variants', 'customers', 'suppliers', 'accounts', 'rates'),
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
    'currencies.read',
    'shop.read',
  ],
  INVENTORY: [
    ...manage('brands', 'models', 'variants', 'suppliers'),
    ...read('rates'),
    'currencies.read',
    'shop.read',
  ],
  FINANCE: [
    ...manage('accounts', 'rates'),
    ...read('suppliers'),
    'shop.read',
    'currencies.read',
    'currencies.update',
    'costs.read',
    'profits.read',
    'audit.read',
  ],
};
