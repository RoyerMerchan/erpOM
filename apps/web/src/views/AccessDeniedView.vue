<script setup lang="ts">
import Message from 'primevue/message';
import AppShell from '../components/AppShell.vue';
</script>

<template>
  <AppShell>
    <header class="module-heading"><h1>Acceso restringido</h1></header>
    <Message severity="warn">Tu rol no tiene permiso para abrir esta sección.</Message>
    <RouterLink class="return-link" :to="{ name: 'dashboard' }">Volver al panel</RouterLink>
  </AppShell>
</template>
