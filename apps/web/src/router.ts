import { resourcePermission } from '@max-sport/shared';
import type { PermissionCode } from '@max-sport/shared';
import type { Pinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { resourcePages } from './navigation';
import { useSessionStore } from './stores/session';

declare module 'vue-router' {
  interface RouteMeta {
    requiresSession?: boolean;
    permission?: PermissionCode;
    extraPermission?: PermissionCode;
    area?: string;
  }
}

export function createAppRouter(pinia: Pinia) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', redirect: { name: 'dashboard' } },
      { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
      {
        path: '/dashboard',
        name: 'dashboard',
        component: () => import('./views/DashboardView.vue'),
        meta: { requiresSession: true },
      },
      {
        path: '/cuenta',
        name: 'account',
        component: () => import('./views/AccountView.vue'),
        meta: { requiresSession: true },
      },
      {
        path: '/sin-acceso',
        name: 'access-denied',
        component: () => import('./views/AccessDeniedView.vue'),
        meta: { requiresSession: true },
      },
      ...resourcePages.map(({ path, resource, area }) => ({
        path,
        component: () => import('./views/CatalogView.vue'),
        props: { resource },
        meta: { requiresSession: true, permission: resourcePermission(resource, 'read'), area },
      })),
      {
        path: '/inventario',
        name: 'inventory',
        component: () => import('./views/InventoryView.vue'),
        meta: { requiresSession: true, permission: 'inventory.read', area: 'products' },
      },
      {
        path: '/compras',
        name: 'purchases',
        component: () => import('./views/PurchasesView.vue'),
        meta: { requiresSession: true, permission: 'purchases.read', area: 'purchases' },
      },
      {
        path: '/compras/por-pagar',
        name: 'payables',
        component: () => import('./views/PurchasesView.vue'),
        props: { payables: true },
        meta: {
          requiresSession: true,
          permission: 'purchases.read',
          extraPermission: 'costs.read',
          area: 'purchases',
        },
      },
      {
        path: '/compras/nueva',
        name: 'purchase-new',
        component: () => import('./views/PurchaseEditorView.vue'),
        meta: {
          requiresSession: true,
          permission: 'purchases.create',
          extraPermission: 'costs.read',
          area: 'purchases',
        },
      },
      {
        path: '/compras/:id/editar',
        name: 'purchase-edit',
        component: () => import('./views/PurchaseEditorView.vue'),
        props: true,
        meta: {
          requiresSession: true,
          permission: 'purchases.update',
          extraPermission: 'costs.read',
          area: 'purchases',
        },
      },
      {
        path: '/compras/:id',
        name: 'purchase-detail',
        component: () => import('./views/PurchaseDetailView.vue'),
        props: true,
        meta: { requiresSession: true, permission: 'purchases.read', area: 'purchases' },
      },
      {
        path: '/ventas/pos',
        name: 'pos',
        component: () => import('./views/PosView.vue'),
        meta: { requiresSession: true, permission: 'sales.create', area: 'sales' },
      },
      {
        path: '/ventas',
        name: 'sales',
        component: () => import('./views/SalesView.vue'),
        meta: { requiresSession: true, permission: 'sales.read', area: 'sales' },
      },
      {
        path: '/ventas/:id',
        name: 'sale-detail',
        component: () => import('./views/SaleDetailView.vue'),
        props: true,
        meta: { requiresSession: true, permission: 'sales.read', area: 'sales' },
      },
      {
        path: '/apartados',
        name: 'layaways',
        component: () => import('./views/LayawaysView.vue'),
        meta: { requiresSession: true, permission: 'layaways.read', area: 'layaways' },
      },
      {
        path: '/apartados/nuevo',
        name: 'layaway-new',
        component: () => import('./views/LayawayEditorView.vue'),
        meta: {
          requiresSession: true,
          permission: 'layaways.create',
          extraPermission: 'layaways.read',
          area: 'layaways',
        },
      },
      {
        path: '/apartados/:id',
        name: 'layaway-detail',
        component: () => import('./views/LayawayDetailView.vue'),
        props: true,
        meta: { requiresSession: true, permission: 'layaways.read', area: 'layaways' },
      },
      {
        path: '/devoluciones',
        name: 'returns',
        component: () => import('./views/ReturnsView.vue'),
        meta: {
          requiresSession: true,
          permission: 'returns.read',
          extraPermission: 'sales.read',
          area: 'sales',
        },
      },
      {
        path: '/devoluciones/nueva/:saleId',
        name: 'return-new',
        component: () => import('./views/ReturnEditorView.vue'),
        props: true,
        meta: {
          requiresSession: true,
          permission: 'returns.create',
          extraPermission: 'sales.read',
          area: 'sales',
        },
      },
      {
        path: '/devoluciones/:id',
        name: 'return-detail',
        component: () => import('./views/ReturnDetailView.vue'),
        props: true,
        meta: {
          requiresSession: true,
          permission: 'returns.read',
          extraPermission: 'sales.read',
          area: 'sales',
        },
      },
      {
        path: '/configuracion',
        component: () => import('./views/ShopView.vue'),
        meta: { requiresSession: true, permission: 'shop.read', area: 'settings' },
      },
      {
        path: '/configuracion/monedas',
        component: () => import('./views/CurrenciesView.vue'),
        meta: { requiresSession: true, permission: 'currencies.read', area: 'settings' },
      },
      {
        path: '/usuarios/roles',
        component: () => import('./views/RolesView.vue'),
        meta: { requiresSession: true, permission: 'roles.read', area: 'staff' },
      },
      {
        path: '/auditoria',
        component: () => import('./views/AuditView.vue'),
        meta: { requiresSession: true, permission: 'audit.read', area: 'audit' },
      },
      { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
    ],
  });

  router.beforeEach(async (route, from) => {
    const session = useSessionStore(pinia);
    await session.restore();
    if (route.meta.requiresSession && session.user && from.matched.length) await session.refresh();
    if (route.meta.requiresSession && !session.user) return { name: 'login' };
    if (session.user?.mustChangePassword && route.name !== 'account') return { name: 'account' };
    if (route.name === 'login' && session.user) return { name: 'dashboard' };
    if (route.meta.permission && !session.can(route.meta.permission))
      return { name: 'access-denied' };
    if (route.meta.extraPermission && !session.can(route.meta.extraPermission))
      return { name: 'access-denied' };
  });
  return router;
}
