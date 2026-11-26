<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { sections } from '../navigation';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const session = useSessionStore();
const links = computed(() =>
  sections.filter(
    (section) =>
      section.area === route.meta.area &&
      section.showInSectionLinks !== false &&
      session.can(section.permission) &&
      (!section.requires || session.can(section.requires)),
  ),
);
</script>

<template>
  <nav v-if="links.length > 1" class="section-links" aria-label="Secciones del módulo">
    <RouterLink v-for="link in links" :key="link.path" :to="link.path">{{ link.label }}</RouterLink>
  </nav>
</template>
