<script setup lang="ts">
import { layawayStatusLabels } from '@max-sport/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getLayaways } from '../after-sale/service';
import AppShell from '../components/AppShell.vue';
import { timeLabel } from '../master-data/field-types';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const { items, page, limit, total, loading, error, load } = usePagedList(getLayaways);
const search = ref('');
const status = ref('');
const overdue = ref(useRoute().query.overdue === 'true');
const filters = ref<Record<string, string>>({});
const applyFilters = () => {
  filters.value = {
    q: search.value.trim(),
    ...(status.value ? { status: status.value } : {}),
    ...(overdue.value ? { overdue: 'true' } : {}),
  };
  void load(filters.value, 1);
};
onMounted(applyFilters);
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <h1>Apartados</h1>
      <RouterLink
        v-if="session.can('layaways.create')"
        :to="{ name: 'layaway-new' }"
        class="p-button p-component"
      >
        <i class="pi pi-plus" aria-hidden="true" /> Nuevo apartado
      </RouterLink>
    </header>
    <section class="records-panel" aria-label="Listado de apartados">
      <form class="sale-history-filters" role="search" @submit.prevent="applyFilters">
        <div class="field sale-history-search">
          <label for="layaway-search">Número, cliente, modelo o SKU</label>
          <InputText id="layaway-search" v-model="search" maxlength="120" fluid />
        </div>
        <div class="field">
          <label for="layaway-status">Estado</label>
          <select id="layaway-status" v-model="status" class="sale-native-select">
            <option value="">Todos</option>
            <option v-for="(label, key) in layawayStatusLabels" :key="key" :value="key">
              {{ label }}
            </option>
          </select>
        </div>
        <label class="activity-check" for="layaway-overdue">
          <Checkbox input-id="layaway-overdue" v-model="overdue" binary /> Vencidos sin cerrar
        </label>
        <Button type="submit" label="Filtrar" icon="pi pi-filter" variant="outlined" />
      </form>
      <Message v-if="error" severity="error" class="records-message">
        {{ error }}
        <button type="button" class="inline-action" @click="load(filters)">Reintentar</button>
      </Message>
      <DataTable
        :value="items"
        :loading="loading"
        :rows="limit"
        :first="(page - 1) * limit"
        :total-records="total"
        :paginator="total > limit"
        :table-style="{ minWidth: '43rem' }"
        data-key="id"
        lazy
        scrollable
        @page="load(filters, $event.page + 1)"
      >
        <template #empty
          ><p class="records-empty">
            {{ loading ? 'Cargando apartados…' : 'No hay apartados para estos filtros.' }}
          </p></template
        >
        <Column header="Apartado"
          ><template #body="{ data }">
            <RouterLink
              :to="{ name: 'layaway-detail', params: { id: data.id } }"
              class="inline-action"
              >{{ data.number }}</RouterLink
            >
          </template></Column
        >
        <Column field="customerName" header="Cliente" />
        <Column header="Estado"
          ><template #body="{ data }">
            {{ layawayStatusLabels[data.status as keyof typeof layawayStatusLabels] }}
            <strong v-if="data.overdue" class="activity-overdue">Vencido</strong>
          </template></Column
        >
        <Column header="Vencimiento"
          ><template #body="{ data }">{{
            data.expiresAt ? timeLabel(data.expiresAt) : '—'
          }}</template></Column
        >
        <Column header="Abonado"
          ><template #body="{ data }">{{ formatMoney(data.paidUsd, 'USD') }}</template></Column
        >
        <Column header="Pendiente"
          ><template #body="{ data }"
            ><strong>{{ formatMoney(data.balanceUsd, 'USD') }}</strong></template
          ></Column
        >
      </DataTable>
    </section>
  </AppShell>
</template>
