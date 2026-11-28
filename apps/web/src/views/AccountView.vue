<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
import ChangePasswordForm from '../components/ChangePasswordForm.vue';
import PageHeading from '../components/PageHeading.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <PageHeading title="Mi cuenta" />
      <p v-if="session.user">
        Usuario <strong>{{ session.user.username }}</strong>
      </p>
    </header>
    <section class="records-panel settings-card" aria-labelledby="change-password">
      <h2 id="change-password">Cambiar contraseña</h2>
      <ChangePasswordForm />
    </section>
  </AppShell>
</template>
