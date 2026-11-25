<script setup lang="ts">
import { changePasswordInput, newPasswordMinLength } from '@max-sport/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError, noContent } from '../api';
import AppShell from '../components/AppShell.vue';
import type { Field, FormValues } from '../master-data/field-types';
import RecordFields from '../master-data/RecordFields.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const router = useRouter();
const toast = useToast();
const fields: Field[] = [
  {
    key: 'currentPassword',
    label: 'Contraseña actual',
    kind: 'password',
    autocomplete: 'current-password',
    required: true,
    max: 128,
  },
  {
    key: 'newPassword',
    label: 'Contraseña nueva',
    kind: 'password',
    autocomplete: 'new-password',
    required: true,
    max: 128,
    help: `Al menos ${newPasswordMinLength} caracteres.`,
  },
  {
    key: 'confirmation',
    label: 'Repetir contraseña nueva',
    kind: 'password',
    autocomplete: 'new-password',
    required: true,
    max: 128,
  },
];
const draft = ref<FormValues>({ currentPassword: '', newPassword: '', confirmation: '' });
const errors = ref<Record<string, string>>({});
const error = ref('');
const saving = ref(false);

async function submit() {
  if (saving.value) return;
  errors.value = {};
  error.value = '';
  const parsed = changePasswordInput.safeParse(draft.value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (typeof issue.path[0] === 'string') errors.value[issue.path[0]] ??= issue.message;
    }
  }
  if (draft.value.newPassword !== draft.value.confirmation) {
    errors.value.confirmation = 'Las contraseñas no coinciden.';
  }
  if (!parsed.success || errors.value.confirmation) return;

  saving.value = true;
  try {
    await noContent('/auth/password', 'POST', parsed.data);
    session.clearSession();
    toast.add({
      severity: 'success',
      summary: 'Contraseña cambiada. Inicia sesión de nuevo.',
      life: 4500,
    });
    await router.replace({ name: 'login' });
  } catch (failure) {
    error.value =
      failure instanceof ApiRequestError ? failure.message : 'No se pudo cambiar la contraseña.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <h1>Mi cuenta</h1>
      <p v-if="session.user">
        Usuario <strong>{{ session.user.username }}</strong>
      </p>
    </header>
    <section class="records-panel settings-card" aria-labelledby="change-password">
      <h2 id="change-password">Cambiar contraseña</h2>
      <p v-if="session.user?.mustChangePassword" class="record-hint">
        Cambia tu contraseña temporal para poder usar la aplicación.
      </p>
      <p v-else class="record-hint">Al cambiarla, se cerrarán tus sesiones abiertas.</p>
      <form class="record-form" novalidate @submit.prevent="submit">
        <RecordFields
          v-model="draft"
          :fields="fields"
          :errors="errors"
          :disabled="saving"
          prefix="my-password"
        />
        <Message v-if="error" severity="error">{{ error }}</Message>
        <div class="record-form-actions">
          <Button label="Cambiar contraseña" type="submit" :loading="saving" :disabled="saving" />
        </div>
      </form>
    </section>
  </AppShell>
</template>
