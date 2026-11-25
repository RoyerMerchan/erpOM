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
  { path: '/ventas/pos', label: 'Punto de venta', area: 'sales', permission: 'sales.create' },
  { path: '/ventas', label: 'Historial', area: 'sales', permission: 'sales.read' },
  {
    path: '/devoluciones',
    label: 'Cambios y devoluciones',
    area: 'sales',
    permission: 'returns.read',
    requires: 'sales.read',
  },
  { path: '/apartados', label: 'Apartados', area: 'layaways', permission: 'layaways.read' },
  { path: '/compras', label: 'Compras', area: 'purchases', permission: 'purchases.read' },
  {
    path: '/compras/por-pagar',
    label: 'Por pagar',
    area: 'purchases',
    permission: 'costs.read',
    requires: 'purchases.read',
  },
  { path: '/finanzas', label: 'Resumen', area: 'finance', permission: 'finance.read' },
  {
    path: '/finanzas/movimientos',
    label: 'Movimientos',
    area: 'finance',
    permission: 'finance.read',
  },
  {
    path: '/finanzas/ingresos-egresos',
    label: 'Ingresos y egresos',
    area: 'finance',
    permission: 'finance.read',
  },
  { path: '/finanzas/gastos', label: 'Gastos', area: 'finance', permission: 'finance.read' },
  {
    path: '/finanzas/por-cobrar',
    label: 'Por cobrar',
    area: 'finance',
    permission: 'finance.read',
  },
  {
    path: '/finanzas/por-pagar',
    label: 'Por pagar',
    area: 'finance',
    permission: 'finance.read',
    requires: 'costs.read',
  },
  {
    path: '/finanzas/rentabilidad',
    label: 'Rentabilidad',
    area: 'finance',
    permission: 'finance.read',
  },
  {
    path: '/finanzas/diario',
    label: 'Reporte diario',
    area: 'finance',
    permission: 'finance.read',
  },
  { path: '/reportes', label: 'Reportes', area: 'reports', permission: 'analytics.read' },
  {
    path: '/catalogo',
    label: 'Catálogo PDF',
    area: 'catalog',
    permission: 'catalog.export',
    requires: 'inventory.read',
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
  { path: '/auditoria', label: 'Auditoría', area: 'audit', permission: 'audit.read' },
];

export const menuGroups = [
  {
    label: 'Operación',
    items: [
      { area: 'sales', label: 'Ventas', icon: 'pi-shopping-cart' },
      { area: 'layaways', label: 'Apartados', icon: 'pi-bookmark' },
      { area: 'products', label: 'Inventario', icon: 'pi-box' },
      { area: 'purchases', label: 'Compras', icon: 'pi-shopping-bag' },
      { area: 'catalog', label: 'Catálogo PDF', icon: 'pi-file-pdf' },
    ],
  },
  {
    label: 'Contactos',
    items: [
      { area: 'customers', label: 'Clientes', icon: 'pi-users' },
      { area: 'suppliers', label: 'Proveedores', icon: 'pi-truck' },
    ],
  },
  {
    label: 'Finanzas y reportes',
    items: [
      { area: 'finance', label: 'Finanzas', icon: 'pi-wallet' },
      { area: 'reports', label: 'Reportes', icon: 'pi-chart-bar' },
    ],
  },
  {
    label: 'Administración',
    items: [
      { area: 'staff', label: 'Usuarios y roles', icon: 'pi-id-card' },
      { area: 'settings', label: 'Configuración', icon: 'pi-cog' },
      { area: 'audit', label: 'Auditoría', icon: 'pi-history' },
    ],
  },
];
