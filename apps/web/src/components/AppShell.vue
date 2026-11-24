<script setup lang="ts">
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';
import Message from 'primevue/message';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import { useSessionStore } from '../stores/session';
import AppNavigation from './AppNavigation.vue';
import BrandLockup from './BrandLockup.vue';

const session = useSessionStore();
const router = useRouter();
const drawerOpen = ref(false);
const signingOut = ref(false);
const signOutError = ref('');
const initials = computed(() =>
  (session.user?.displayName ?? '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.slice(0, 1))
    .join('')
    .toUpperCase(),
);

async function signOut() {
  if (signingOut.value) return;
  signingOut.value = true;
  signOutError.value = '';
  try {
    await session.signOut();
    drawerOpen.value = false;
    await router.replace({ name: 'login' });
  } catch (error) {
    drawerOpen.value = false;
    signOutError.value =
      error instanceof ApiRequestError ? error.message : 'No se pudo cerrar la sesión.';
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <div class="workspace-shell">
    <a class="skip-link" href="#workspace-content">Ir al contenido</a>

    <aside class="workspace-sidebar">
      <BrandLockup :name="session.shop?.name" :logo-url="session.shop?.logoUrl" />
      <AppNavigation :signing-out="signingOut" @sign-out="signOut" />
    </aside>

    <div class="workspace-body">
      <header class="workspace-topbar">
        <div class="mobile-header">
          <Button
            icon="pi pi-bars"
            text
            severity="secondary"
            aria-label="Abrir menú"
            aria-haspopup="dialog"
            :aria-expanded="drawerOpen"
            class="menu-toggle"
            @click="drawerOpen = true"
          />
          <BrandLockup :name="session.shop?.name" :logo-url="session.shop?.logoUrl" />
        </div>
        <div v-if="session.user" class="workspace-profile">
          <Avatar :label="initials" shape="circle" class="profile-avatar" aria-hidden="true" />
          <div class="profile-copy">
            <strong>{{ session.user.displayName }}</strong>
            <span>{{ session.user.role.label }}</span>
          </div>
        </div>
      </header>

      <main id="workspace-content" tabindex="-1" class="workspace-content">
        <Message v-if="signOutError" severity="error" class="mb-6">{{ signOutError }}</Message>
        <slot />
      </main>
    </div>

    <Drawer v-model:visible="drawerOpen" header="Menú" aria-label="Menú" class="mobile-nav-drawer">
      <AppNavigation :signing-out="signingOut" @navigate="drawerOpen = false" @sign-out="signOut" />
    </Drawer>
  </div>
</template>
