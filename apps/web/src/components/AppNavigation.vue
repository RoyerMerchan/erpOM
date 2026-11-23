<script setup lang="ts">
import Button from 'primevue/button';

defineProps<{ signingOut: boolean }>();
const emit = defineEmits<{ navigate: []; signOut: [] }>();
</script>

<template>
  <div class="navigation-stack">
    <nav class="app-navigation" aria-label="Navegación principal">
      <RouterLink :to="{ name: 'dashboard' }" class="navigation-link" @click="emit('navigate')">
        <span class="pi pi-th-large" aria-hidden="true" />
        Panel
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
