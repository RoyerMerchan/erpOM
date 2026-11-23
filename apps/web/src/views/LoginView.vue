<script setup lang="ts">
import { loginSchema } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { nextTick, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import BrandLockup from '../components/BrandLockup.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const router = useRouter();
const form = reactive({ email: '', password: '' });
const fieldErrors = reactive<Partial<Record<keyof typeof form, string>>>({});
const requestError = ref('');
const submitting = ref(false);

function clearError(field: keyof typeof form) {
  delete fieldErrors[field];
  requestError.value = '';
}

async function submit() {
  if (submitting.value) return;
  clearError('email');
  clearError('password');
  const parsed = loginSchema.safeParse(form);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'email' || field === 'password') fieldErrors[field] = issue.message;
    }
    await nextTick();
    document.getElementById(fieldErrors.email ? 'email' : 'password')?.focus();
    return;
  }

  submitting.value = true;
  try {
    await session.signIn(parsed.data);
    await router.replace({ name: 'dashboard' });
  } catch (error) {
    requestError.value =
      error instanceof ApiRequestError ? error.message : 'No se pudo iniciar sesión.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-shell">
    <aside class="login-brand" aria-label="MAX Sport Manager">
      <BrandLockup />
      <p class="login-statement">Inventario y punto de venta</p>
    </aside>

    <main class="login-main">
      <div class="login-form-wrap">
        <h1>Iniciar sesión</h1>

        <Message v-if="requestError || session.restoreError" severity="error" class="login-message">
          {{ requestError || session.restoreError }}
        </Message>

        <form class="login-form" novalidate @submit.prevent="submit">
          <div class="access-field">
            <label for="email">Correo electrónico</label>
            <InputText
              id="email"
              v-model="form.email"
              name="email"
              type="email"
              autocomplete="username"
              required
              fluid
              :invalid="Boolean(fieldErrors.email)"
              :aria-describedby="fieldErrors.email ? 'email-error' : undefined"
              :aria-invalid="Boolean(fieldErrors.email)"
              @update:model-value="clearError('email')"
            />
            <p v-if="fieldErrors.email" id="email-error" class="field-error">
              {{ fieldErrors.email }}
            </p>
          </div>

          <div class="access-field">
            <label for="password">Contraseña</label>
            <Password
              v-model="form.password"
              input-id="password"
              name="password"
              autocomplete="current-password"
              required
              fluid
              toggle-mask
              :feedback="false"
              :invalid="Boolean(fieldErrors.password)"
              :input-props="{
                'aria-describedby': fieldErrors.password ? 'password-error' : undefined,
                'aria-invalid': Boolean(fieldErrors.password),
              }"
              @update:model-value="clearError('password')"
            />
            <p v-if="fieldErrors.password" id="password-error" class="field-error">
              {{ fieldErrors.password }}
            </p>
          </div>

          <Button
            type="submit"
            label="Entrar"
            class="access-submit"
            :loading="submitting"
            :disabled="submitting"
          />
        </form>
      </div>
    </main>
  </div>
</template>
