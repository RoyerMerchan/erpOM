<script setup lang="ts">
import Message from 'primevue/message';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
</script>

<template>
  <AppShell>
    <header class="module-heading"><PageHeading title="Acceso restringido" /></header>
    <Message severity="warn">Tu rol no tiene permiso para abrir esta sección.</Message>
    <RouterLink class="return-link" :to="{ name: 'dashboard' }">Volver al panel</RouterLink>
  </AppShell>
</template>
