import '@fontsource-variable/inter';
import 'primeicons/primeicons.css';
import './styles.css';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';

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
createApp(App)
  .use(pinia)
  .use(createAppRouter(pinia))
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
