<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { timeLabel } from '../master-data/field-types';
import type { FieldValue } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';
import OperatorSelect from '../sales/OperatorSelect.vue';
import { getSales } from '../sales/service';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const { items, loading, error, page, total, limit, load } = usePagedList(getSales);
const search = ref('');
const start = ref('');
const end = ref('');
const sellerId = ref<string | null>(null);
const customerId = ref<FieldValue>(null);
const currency = ref<FieldValue>(null);
const filters = ref<Record<string, string>>({});
const filterError = ref('');

function localMidnight(value: string, nextDay = false) {
  const date = new Date(value + 'T00:00:00');
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function applyFilters() {
  filterError.value = '';
  if (start.value && end.value && start.value > end.value) {
    filterError.value = 'La fecha inicial debe ser igual o anterior a la final.';
    return;
  }
  filters.value = {
    q: search.value.trim(),
    ...(start.value ? { from: localMidnight(start.value) } : {}),
    ...(end.value ? { to: localMidnight(end.value, true) } : {}),
    ...(sellerId.value ? { sellerId: sellerId.value } : {}),
    ...(typeof customerId.value === 'string' ? { customerId: customerId.value } : {}),
    ...(typeof currency.value === 'string' ? { currencyCode: currency.value } : {}),
  };
  void load(filters.value, 1);
}
onMounted(() => void load(filters.value));
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <h1>Historial de ventas</h1>
      <RouterLink
        v-if="session.can('sales.create')"
        :to="{ name: 'pos' }"
        class="p-button p-component"
      >
        <i class="pi pi-plus" aria-hidden="true" /> Nueva venta
      </RouterLink>
    </header>

    <section class="records-panel" aria-label="Ventas registradas">
      <form class="sale-history-filters" role="search" @submit.prevent="applyFilters">
        <div class="field sale-history-search">
          <label for="history-search">Comprobante, cliente, modelo o SKU</label>
          <InputText id="history-search" v-model="search" maxlength="120" fluid />
        </div>
        <div class="field">
          <label for="history-from">Desde</label>
          <InputText id="history-from" v-model="start" type="date" fluid />
        </div>
        <div class="field">
          <label for="history-until">Hasta</label>
          <InputText id="history-until" v-model="end" type="date" fluid />
        </div>
        <div class="field">
          <label for="history-currency">Moneda de cobro</label>
          <LookupSelect
            id="history-currency"
            v-model="currency"
            resource="currencies"
            placeholder="Todas"
            clearable
          />
        </div>
        <div v-if="session.can('sales.read.all')" class="field">
          <label for="history-seller">Vendedor</label>
          <OperatorSelect id="history-seller" v-model="sellerId" placeholder="Todos" />
        </div>
        <div v-if="session.can('customers.read')" class="field">
          <label for="history-customer">Cliente</label>
          <LookupSelect
            id="history-customer"
            v-model="customerId"
            resource="customers"
            placeholder="Todos"
            clearable
          />
        </div>
        <Button type="submit" label="Filtrar" icon="pi pi-filter" variant="outlined" />
      </form>
      <Message v-if="error || filterError" severity="error" class="records-message">
        {{ filterError || error }}
        <button
          v-if="error && !filterError"
          class="inline-action"
          type="button"
          @click="load(filters)"
        >
          Reintentar
        </button>
      </Message>

      <DataTable
        :value="items"
        :loading="loading"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        :paginator="total > limit"
        :table-style="{ minWidth: '43rem' }"
        data-key="id"
        lazy
        scrollable
        @page="load(filters, $event.page + 1)"
      >
        <template #empty>
          <p class="records-empty">
            {{ loading ? 'Cargando ventas…' : 'No hay ventas para estos filtros.' }}
          </p>
        </template>
        <Column header="Comprobante">
          <template #body="{ data }">
            <RouterLink
              class="inline-action"
              :to="{ name: 'sale-detail', params: { id: data.id } }"
            >
              {{ data.receiptNumber }}
            </RouterLink>
          </template>
        </Column>
        <Column header="Fecha">
          <template #body="{ data }">{{ timeLabel(data.confirmedAt) }}</template>
        </Column>
        <Column field="customerName" header="Cliente" />
        <Column field="sellerName" header="Vendedor" />
        <Column field="pairCount" header="Pares" />
        <Column header="Total">
          <template #body="{ data }"
            ><strong>{{ formatMoney(data.totalUsd, 'USD') }}</strong></template
          >
        </Column>
        <Column v-if="session.can('costs.read')" header="Costo FIFO">
          <template #body="{ data }">{{ formatMoney(data.cogsUsd, 'USD') }}</template>
        </Column>
        <Column
          v-if="session.can('costs.read') && session.can('profits.read')"
          header="Utilidad bruta"
        >
          <template #body="{ data }">{{ formatMoney(data.grossProfitUsd, 'USD') }}</template>
        </Column>
      </DataTable>
    </section>
  </AppShell>
</template>
