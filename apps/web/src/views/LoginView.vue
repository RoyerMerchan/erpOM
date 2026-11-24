<script setup lang="ts">
import { loginSchema } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { nextTick, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import loginPhotoUrl from '../assets/login-sneaker.jpg';
import { useSessionStore } from '../stores/session';
import './login.css';

const loginLogoUrl = `${import.meta.env.BASE_URL}c3fc4a9b-dec5-473f-8fc9-866f44ff94a2.jpg`;
const session = useSessionStore();
const router = useRouter();
const form = reactive({ username: '', password: '' });
const fieldErrors = reactive<Partial<Record<keyof typeof form, string>>>({});
const requestError = ref('');
const submitting = ref(false);
const passwordVisible = ref(false);

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
  <main class="login-shell">
    <div class="login-frame">
      <aside class="login-brand">
        <img
          :src="loginPhotoUrl"
          alt=""
          class="login-photo"
          width="1122"
          height="1402"
          fetchpriority="high"
          decoding="async"
        />
        <div class="login-logo">
          <img :src="loginLogoUrl" alt="OM Store" width="640" height="640" />
        </div>
        <p class="login-statement">Inventario y <span>punto de venta</span></p>
      </aside>

      <section class="login-main" aria-labelledby="login-heading">
        <div class="login-form-wrap">
          <header class="login-form-header">
            <div class="login-product">
              <span class="login-product-icon" aria-hidden="true">
                <i class="pi pi-sign-in"></i>
              </span>
              <span>OM ERP</span>
            </div>
            <h1 id="login-heading">Iniciar sesión</h1>
          </header>

          <Message
            v-if="requestError || session.restoreError"
            severity="error"
            class="login-message"
          >
            {{ requestError || session.restoreError }}
          </Message>

          <form class="login-form" :aria-busy="submitting" novalidate @submit.prevent="submit">
            <div class="access-field">
              <label for="username">Usuario</label>
              <div class="login-control">
                <i class="pi pi-user login-field-icon" aria-hidden="true"></i>
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
              </div>
              <p v-if="fieldErrors.username" id="username-error" class="field-error">
                {{ fieldErrors.username }}
              </p>
            </div>

            <div class="access-field">
              <label for="password">Contraseña</label>
              <div class="login-control login-password">
                <i class="pi pi-lock login-field-icon" aria-hidden="true"></i>
                <InputText
                  id="password"
                  v-model="form.password"
                  :type="passwordVisible ? 'text' : 'password'"
                  name="password"
                  autocomplete="current-password"
                  autocapitalize="none"
                  spellcheck="false"
                  required
                  fluid
                  :invalid="Boolean(fieldErrors.password)"
                  :aria-describedby="fieldErrors.password ? 'password-error' : undefined"
                  :aria-invalid="Boolean(fieldErrors.password)"
                  @update:model-value="clearError('password')"
                />
                <button
                  type="button"
                  class="login-mask-toggle"
                  :aria-label="passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  aria-controls="password"
                  @click="passwordVisible = !passwordVisible"
                >
                  <i
                    class="pi"
                    :class="passwordVisible ? 'pi-eye-slash' : 'pi-eye'"
                    aria-hidden="true"
                  ></i>
                </button>
              </div>
              <p v-if="fieldErrors.password" id="password-error" class="field-error">
                {{ fieldErrors.password }}
              </p>
            </div>

            <Button
              type="submit"
              :label="submitting ? 'Ingresando…' : 'Entrar'"
              icon="pi pi-arrow-right"
              icon-pos="right"
              class="access-submit"
              :loading="submitting"
              :disabled="submitting"
            />
          </form>

          <p class="login-help">
            <i class="pi pi-info-circle" aria-hidden="true"></i>
            <span>Si necesitas ayuda con tu cuenta, contacta a tu administrador.</span>
          </p>
        </div>
      </section>
    </div>
  </main>
</template>
