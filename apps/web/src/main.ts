import '@fontsource-variable/inter';
import 'primeicons/primeicons.css';
import './styles.css';
import './master-data/styles.css';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';
import { createApp } from 'vue';
import { onSessionExpired } from './api';
import App from './App.vue';
import { createAppRouter } from './router';
import { useSessionStore } from './stores/session';

const preset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
      },
    },
  },
});

const pinia = createPinia();
const router = createAppRouter(pinia);
onSessionExpired(() => {
  useSessionStore(pinia).clearSession();
  void router.replace({ name: 'login' });
});
createApp(App)
  .use(pinia)
  .use(router)
  .use(ToastService)
  .use(ConfirmationService)
  .use(PrimeVue, {
    theme: {
      preset,
      options: {
        darkModeSelector: false,
        cssLayer: { name: 'primevue', order: 'theme, base, primevue, components, utilities' },
      },
    },
    locale: {
      aria: {
        close: 'Cerrar',
        showPassword: 'Mostrar contraseña',
        hidePassword: 'Ocultar contraseña',
      },
    },
  })
  .mount('#app');
