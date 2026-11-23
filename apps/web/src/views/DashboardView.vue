<script setup lang="ts">
import Button from 'primevue/button';
import { computed, onMounted, ref } from 'vue';
import { ApiRequestError, checkLiveness, checkReadiness } from '../api';
import AppShell from '../components/AppShell.vue';

type ServiceStatus = 'checking' | 'ready' | 'offline' | 'unconfirmed';

const statusLabels: Record<ServiceStatus, string> = {
  checking: 'Comprobando',
  ready: 'Disponible',
  offline: 'Sin conexión',
  unconfirmed: 'Sin comprobar',
};

const apiStatus = ref<ServiceStatus>('checking');
const databaseStatus = ref<ServiceStatus>('checking');
const checking = ref(false);
const lastCheck = ref<Date>();
const checkTime = computed(() =>
  lastCheck.value
    ? new Intl.DateTimeFormat('es', { timeStyle: 'medium' }).format(lastCheck.value)
    : '',
);

async function refresh() {
  if (checking.value) return;
  checking.value = true;
  apiStatus.value = 'checking';
  databaseStatus.value = 'checking';

  const [api, database] = await Promise.allSettled([checkLiveness(), checkReadiness()]);
  apiStatus.value = api.status === 'fulfilled' ? 'ready' : 'offline';
  if (database.status === 'fulfilled') {
    databaseStatus.value = 'ready';
  } else if (
    database.reason instanceof ApiRequestError &&
    database.reason.code === 'DATABASE_UNAVAILABLE'
  ) {
    databaseStatus.value = 'offline';
  } else {
    databaseStatus.value = 'unconfirmed';
  }
  lastCheck.value = new Date();
  checking.value = false;
}

onMounted(refresh);
</script>

<template>
  <AppShell>
    <h1 class="workspace-title">Panel</h1>

    <section class="status-card" aria-labelledby="system-status">
      <div class="status-card-header">
        <div>
          <h2 id="system-status">Estado del sistema</h2>
          <p v-if="lastCheck" class="status-check-time">
            Última comprobación <time :datetime="lastCheck.toISOString()">{{ checkTime }}</time>
          </p>
        </div>
        <Button
          label="Actualizar"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="checking"
          :disabled="checking"
          @click="refresh"
        />
      </div>

      <dl class="status-list" aria-live="polite" :aria-busy="checking">
        <div class="service-row">
          <dt><span class="service-icon pi pi-server" aria-hidden="true" /> API</dt>
          <dd>
            <span class="service-status" :class="`is-${apiStatus}`">{{
              statusLabels[apiStatus]
            }}</span>
          </dd>
        </div>
        <div class="service-row">
          <dt><span class="service-icon pi pi-database" aria-hidden="true" /> PostgreSQL</dt>
          <dd>
            <span class="service-status" :class="`is-${databaseStatus}`">{{
              statusLabels[databaseStatus]
            }}</span>
          </dd>
        </div>
      </dl>
    </section>
  </AppShell>
</template>
