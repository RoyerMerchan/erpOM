<script setup lang="ts">
import Button from 'primevue/button';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { menuItems, sections } from '../navigation';
import { useSessionStore } from '../stores/session';

defineProps<{ signingOut: boolean }>();
const emit = defineEmits<{ navigate: []; signOut: [] }>();
const route = useRoute();
const session = useSessionStore();
const links = computed(() =>
  menuItems.flatMap((item) => {
    const section = sections.find(
      ({ area, permission }) => area === item.area && session.can(permission),
    );
    return section ? [{ ...item, path: section.path }] : [];
  }),
);
</script>

<template>
  <div class="navigation-stack">
    <nav class="app-navigation" aria-label="Navegación principal">
      <RouterLink
        v-if="!session.user?.mustChangePassword"
        :to="{ name: 'dashboard' }"
        class="navigation-link"
        @click="emit('navigate')"
      >
        <span class="pi pi-th-large" aria-hidden="true" /> Panel
      </RouterLink>
      <RouterLink
        v-for="item in links"
        :key="item.area"
        :to="item.path"
        class="navigation-link"
        :class="{ 'navigation-active': route.meta.area === item.area }"
        @click="emit('navigate')"
      >
        <span class="pi" :class="item.icon" aria-hidden="true" /> {{ item.label }}
      </RouterLink>
      <RouterLink
        v-if="session.can('audit.read')"
        to="/auditoria"
        class="navigation-link"
        @click="emit('navigate')"
      >
        <span class="pi pi-history" aria-hidden="true" /> Auditoría
      </RouterLink>
      <RouterLink :to="{ name: 'account' }" class="navigation-link" @click="emit('navigate')">
        <span class="pi pi-user" aria-hidden="true" /> Mi cuenta
      </RouterLink>
    </nav>
    <Button
      class="navigation-sign-out"
      icon="pi pi-sign-out"
      label="Cerrar sesión"
      text
      :loading="signingOut"
      @click="emit('signOut')"
    />
  </div>
</template>
