import { resourcePermission } from '@max-sport/shared';
import type { PermissionCode, ResourceKey } from '@max-sport/shared';

export const resourcePages = [
  { resource: 'variants', path: '/inventario/variantes', label: 'Variantes', area: 'products' },
  { resource: 'models', path: '/inventario/modelos', label: 'Modelos', area: 'products' },
  { resource: 'brands', path: '/inventario/marcas', label: 'Marcas', area: 'products' },
  { resource: 'customers', path: '/clientes', label: 'Clientes', area: 'customers' },
  { resource: 'suppliers', path: '/proveedores', label: 'Proveedores', area: 'suppliers' },
  { resource: 'accounts', path: '/finanzas/cuentas', label: 'Cuentas', area: 'finance' },
  { resource: 'rates', path: '/finanzas/tasas', label: 'Tasas históricas', area: 'finance' },
  { resource: 'users', path: '/usuarios', label: 'Usuarios', area: 'staff' },
] as const satisfies { resource: ResourceKey; path: string; label: string; area: string }[];

export const sections: {
  path: string;
  label: string;
  area: string;
  permission: PermissionCode;
  requires?: PermissionCode;
}[] = [
  { path: '/inventario', label: 'Existencias', area: 'products', permission: 'inventory.read' },
  { path: '/compras', label: 'Compras', area: 'purchases', permission: 'purchases.read' },
  {
    path: '/compras/por-pagar',
    label: 'Por pagar',
    area: 'purchases',
    permission: 'costs.read',
    requires: 'purchases.read',
  },
  ...resourcePages.map((item) => ({
    path: item.path,
    label: item.label,
    area: item.area,
    permission: resourcePermission(item.resource, 'read'),
  })),
  { path: '/configuracion', label: 'Tienda', area: 'settings', permission: 'shop.read' },
  {
    path: '/configuracion/monedas',
    label: 'Monedas',
    area: 'settings',
    permission: 'currencies.read',
  },
  { path: '/usuarios/roles', label: 'Roles y acceso', area: 'staff', permission: 'roles.read' },
];

export const menuItems = [
  { area: 'products', label: 'Inventario', icon: 'pi-box' },
  { area: 'purchases', label: 'Compras', icon: 'pi-shopping-bag' },
  { area: 'customers', label: 'Clientes', icon: 'pi-users' },
  { area: 'suppliers', label: 'Proveedores', icon: 'pi-truck' },
  { area: 'finance', label: 'Cuentas y tasas', icon: 'pi-wallet' },
  { area: 'staff', label: 'Usuarios y roles', icon: 'pi-id-card' },
  { area: 'settings', label: 'Configuración', icon: 'pi-cog' },
];
