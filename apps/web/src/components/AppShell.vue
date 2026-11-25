<script setup lang="ts">
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Drawer from 'primevue/drawer';
import Message from 'primevue/message';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import { menuGroups, sections } from '../navigation';
import { useSessionStore } from '../stores/session';
import AppNavigation from './AppNavigation.vue';
import BrandLockup from './BrandLockup.vue';

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const drawerOpen = ref(false);
const signingOut = ref(false);
const signOutError = ref('');
const activeModule = computed(() =>
  menuGroups.flatMap(({ items }) => items).find(({ area }) => area === route.meta.area),
);
const activeSection = computed(() => sections.find(({ path }) => path === route.path));
const workspaceLabel = computed(() => {
  if (activeModule.value) return activeModule.value.label;
  if (route.name === 'access-denied') return 'Acceso restringido';
  return route.name === 'account' ? 'Mi cuenta' : 'Panel';
});
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
        <div class="workspace-location">
          <span
            class="workspace-location-icon pi"
            :class="activeModule?.icon ?? 'pi-th-large'"
            aria-hidden="true"
          />
          <span>{{ workspaceLabel }}</span>
          <template v-if="activeSection && activeSection.label !== workspaceLabel">
            <span class="pi pi-angle-right workspace-location-separator" aria-hidden="true" />
            <span class="workspace-subsection">{{ activeSection.label }}</span>
          </template>
        </div>
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
