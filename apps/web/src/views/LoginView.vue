<script setup lang="ts">
import { loginSchema } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { nextTick, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import { useSessionStore } from '../stores/session';

const loginLogoUrl = `${import.meta.env.BASE_URL}c3fc4a9b-dec5-473f-8fc9-866f44ff94a2.jpg`;
const session = useSessionStore();
const router = useRouter();
const form = reactive({ username: '', password: '' });
const fieldErrors = reactive<Partial<Record<keyof typeof form, string>>>({});
const requestError = ref('');
const submitting = ref(false);

function clearError(field: keyof typeof form) {
  delete fieldErrors[field];
  requestError.value = '';
}

async function submit() {
  if (submitting.value) return;
  clearError('username');
  clearError('password');
  const parsed = loginSchema.safeParse(form);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === 'username' || field === 'password') && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    await nextTick();
    document.getElementById(fieldErrors.username ? 'username' : 'password')?.focus();
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
    <aside class="login-brand">
      <div class="login-logo">
        <img :src="loginLogoUrl" alt="OM Store" width="640" height="640" />
      </div>
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
            <label for="username">Usuario</label>
            <InputText
              id="username"
              v-model="form.username"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              required
              fluid
              :invalid="Boolean(fieldErrors.username)"
              :aria-describedby="fieldErrors.username ? 'username-error' : undefined"
              :aria-invalid="Boolean(fieldErrors.username)"
              @update:model-value="clearError('username')"
            />
            <p v-if="fieldErrors.username" id="username-error" class="field-error">
              {{ fieldErrors.username }}
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
