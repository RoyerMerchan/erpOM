import type { LoginInput, SessionUser } from '@max-sport/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiRequestError, getSession, login, logout } from '../api';

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null);
  const restoreError = ref('');
  let initialization: Promise<void> | undefined;

  async function restoreFromServer() {
    try {
      user.value = (await getSession()).user;
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 401) {
        restoreError.value = 'No se pudo comprobar la sesión. Puedes volver a iniciar sesión.';
      }
    }
  }

  function restore() {
    initialization ??= restoreFromServer();
    return initialization;
  }

  async function signIn(input: LoginInput) {
    restoreError.value = '';
    user.value = (await login(input)).user;
  }

  async function signOut() {
    await logout();
    user.value = null;
  }

  return { user, restoreError, restore, signIn, signOut };
});
