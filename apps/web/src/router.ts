import type { Pinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from './stores/session';

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
      { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
    ],
  });

  router.beforeEach(async (route) => {
    const session = useSessionStore(pinia);
    await session.restore();
    if (route.meta.requiresSession && !session.user) return { name: 'login' };
    if (route.name === 'login' && session.user) return { name: 'dashboard' };
  });

  return router;
}
