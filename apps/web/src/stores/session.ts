import type { LoginInput, PermissionCode, SessionUser } from '@max-sport/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiRequestError, getSession, login, logout } from '../api';
import { getShop } from '../master-data/service';

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null);
  const shop = ref<Awaited<ReturnType<typeof getShop>> | null>(null);
  const restoreError = ref('');
  let initialization: Promise<void> | undefined;

  function can(permission: PermissionCode) {
    return (
      !!user.value && !user.value.mustChangePassword && user.value.permissions.includes(permission)
    );
  }

  async function loadShop() {
    const id = user.value?.id;
    if (!id || !can('shop.read')) {
      shop.value = null;
      return;
    }
    try {
      const settings = await getShop();
      if (user.value?.id === id && can('shop.read')) shop.value = settings;
    } catch {
      // The shop view reports errors when the user opens its configuration.
    }
  }

  function clearSession() {
    user.value = null;
    shop.value = null;
    restoreError.value = '';
  }

  async function refresh() {
    try {
      const result = await getSession();
      user.value = result.user;
      restoreError.value = '';
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) clearSession();
      else restoreError.value = 'No se pudo comprobar la sesión. Puedes volver a iniciar sesión.';
    }
  }

  function restore() {
    initialization ??= refresh().then(() => {
      void loadShop();
    });
    return initialization;
  }

  async function signIn(input: LoginInput) {
    restoreError.value = '';
    user.value = (await login(input)).user;
    void loadShop();
  }

  async function signOut() {
    await logout();
    clearSession();
  }

  return { user, shop, restoreError, refresh, restore, signIn, signOut, clearSession, can };
});
