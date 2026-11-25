import '@fontsource-variable/inter';
import 'primeicons/primeicons.css';
import './styles.css';
import './master-data/styles.css';
import './purchasing/styles.css';
import './sales/styles.css';
import './after-sale/styles.css';
import './finance/styles.css';
import './analytics/styles.css';
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
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
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
