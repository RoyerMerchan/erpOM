<script setup lang="ts">
import { loginSchema } from '@max-sport/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { nextTick, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import AccessField from '../components/AccessField.vue';
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
      <div class="login-brand">
        <div class="login-waves" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="login-logo">
          <img :src="loginLogoUrl" alt="OM Store" width="640" height="640" />
        </div>
        <div class="login-brand-copy">
          <p class="login-statement">Controla tu negocio <span>con claridad</span></p>
          <p class="login-description">
            Gestiona inventario, ventas y operación desde un solo lugar.
          </p>
        </div>
      </div>

      <section class="login-main" aria-labelledby="login-heading">
        <div class="login-form-wrap">
          <header class="login-form-header">
            <div class="login-product">
              <span class="login-product-icon" aria-hidden="true">
                <span class="login-product-layers"></span>
              </span>
              <span>OM ERP</span>
            </div>
            <h1 id="login-heading">Iniciar sesión</h1>
          </header>

          <Message
            v-if="requestError || session.restoreError"
            severity="error"
            icon="pi pi-exclamation-circle"
            class="login-message"
          >
            {{ requestError || session.restoreError }}
          </Message>

          <form class="login-form" :aria-busy="submitting" novalidate @submit.prevent="submit">
            <AccessField
              id="username"
              v-model="form.username"
              label="Usuario"
              icon="pi-id-card"
              placeholder="Ingresa tu usuario"
              autocomplete="username"
              :error="fieldErrors.username"
              @update:model-value="clearError('username')"
            />
            <AccessField
              id="password"
              v-model="form.password"
              label="Clave de acceso"
              icon="pi-key"
              placeholder="Ingresa tu contraseña"
              autocomplete="current-password"
              :type="passwordVisible ? 'text' : 'password'"
              :error="fieldErrors.password"
              @update:model-value="clearError('password')"
            >
              <template #action>
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
              </template>
            </AccessField>

            <Button
              type="submit"
              :label="submitting ? 'Verificando credenciales...' : 'Acceder al sistema'"
              icon="pi pi-arrow-right"
              icon-pos="right"
              loading-icon="pi pi-spinner pi-spin"
              class="access-submit"
              :loading="submitting"
              :disabled="submitting"
            />
          </form>

          <p class="login-help">
            <i class="pi pi-headphones" aria-hidden="true"></i>
            <span>
              <strong>¿Necesitas ayuda?</strong>
              Contacta al administrador del sistema.
            </span>
          </p>
        </div>
      </section>
    </div>
  </main>
</template>
