<script setup lang="ts">
import Button from 'primevue/button';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { menuGroups, sections } from '../navigation';
import { useSessionStore } from '../stores/session';

defineProps<{ signingOut: boolean }>();
const emit = defineEmits<{ navigate: []; signOut: [] }>();
const route = useRoute();
const session = useSessionStore();
const groups = computed(() =>
  menuGroups
    .map(({ label, items }) => ({
      label,
      links: items.flatMap((item) => {
        const section = sections.find(
          ({ area, permission, requires }) =>
            area === item.area && session.can(permission) && (!requires || session.can(requires)),
        );
        return section ? [{ ...item, path: section.path }] : [];
      }),
    }))
    .filter(({ links }) => links.length),
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
      <div v-for="group in groups" :key="group.label" class="navigation-group">
        <p class="navigation-group-title">{{ group.label }}</p>
        <ul class="navigation-group-links" :aria-label="group.label">
          <li v-for="item in group.links" :key="item.area">
            <RouterLink
              :to="item.path"
              class="navigation-link"
              :class="{ 'navigation-active': route.meta.area === item.area }"
              @click="emit('navigate')"
            >
              <span class="pi" :class="item.icon" aria-hidden="true" /> {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
    <div class="navigation-account">
      <RouterLink :to="{ name: 'account' }" class="navigation-link" @click="emit('navigate')">
        <span class="pi pi-user" aria-hidden="true" /> Mi cuenta
      </RouterLink>
      <Button
        class="navigation-sign-out"
        icon="pi pi-sign-out"
        label="Cerrar sesión"
        text
        :loading="signingOut"
        @click="emit('signOut')"
      />
    </div>
  </div>
</template>
