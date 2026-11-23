<script setup lang="ts">
import { paymentStatusLabels, purchaseStatusLabels } from '@max-sport/shared';
import type { PurchaseSummary } from '@max-sport/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { timeLabel } from '../master-data/field-types';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';
import { getPurchases } from '../purchasing/service';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ payables?: boolean }>();
const session = useSessionStore();
const search = ref('');
const applied = ref('');
const status = ref('');
const statuses = [
  { value: '', label: 'Todos los estados' },
  ...Object.entries(purchaseStatusLabels).map(([value, label]) => ({ value, label })),
];
const list = usePagedList((query) => getPurchases(query, Boolean(props.payables)));
const { items, loading, error, page, total, limit } = list;
const summaryLabel = (row: PurchaseSummary) =>
  row.reference || 'Compra del ' + timeLabel(row.documentAt);

function load(value = page.value) {
  return list.load({ q: applied.value, ...(status.value ? { status: status.value } : {}) }, value);
}
function applySearch() {
  applied.value = search.value;
  void load(1);
}

onMounted(() => void load());
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <h1>{{ payables ? 'Cuentas por pagar' : 'Compras' }}</h1>
      <RouterLink
        v-if="!payables && session.can('purchases.create') && session.can('costs.read')"
        :to="{ name: 'purchase-new' }"
        class="p-button p-component"
        ><i class="pi pi-plus" aria-hidden="true" /> Nueva compra</RouterLink
      >
    </header>
    <section
      class="records-panel"
      :aria-label="payables ? 'Compras por pagar' : 'Listado de compras'"
    >
      <form class="records-toolbar" @submit.prevent="applySearch">
        <div class="records-search">
          <InputText
            v-model="search"
            placeholder="Buscar proveedor o referencia"
            aria-label="Buscar proveedor o referencia"
            maxlength="120"
            fluid
          />
          <Button type="submit" label="Buscar" severity="secondary" outlined />
        </div>
        <Select
          v-if="!payables"
          v-model="status"
          :options="statuses"
          option-label="label"
          option-value="value"
          aria-label="Estado de compra"
          @update:model-value="load(1)"
        />
      </form>
      <Message v-if="error" severity="error" class="records-message"
        >{{ error }}
        <button type="button" class="inline-action" @click="load()">Reintentar</button></Message
      >
      <DataTable
        :value="items"
        :loading="loading"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        :paginator="total > limit"
        :table-style="{ minWidth: '47rem' }"
        data-key="id"
        lazy
        scrollable
        @page="load($event.page + 1)"
      >
        <template #empty
          ><p class="records-empty">
            {{
              loading
                ? 'Cargando compras…'
                : error
                  ? 'Listado no disponible.'
                  : payables
                    ? 'No hay compras con saldo pendiente.'
                    : 'No hay compras para estos filtros.'
            }}
          </p></template
        >
        <Column header="Referencia"
          ><template #body="{ data }"
            ><RouterLink
              class="inline-action"
              :to="{ name: 'purchase-detail', params: { id: data.id } }"
              >{{ summaryLabel(data) }}</RouterLink
            ></template
          ></Column
        >
        <Column field="supplierName" header="Proveedor" />
        <Column header="Fecha"
          ><template #body="{ data }">{{ timeLabel(data.documentAt) }}</template></Column
        >
        <Column field="pairCount" header="Pares" />
        <Column v-if="!payables" header="Estado"
          ><template #body="{ data }">
            <Tag
              :severity="
                data.status === 'CONFIRMED'
                  ? 'success'
                  : data.status === 'VOIDED'
                    ? 'secondary'
                    : 'info'
              "
              :value="purchaseStatusLabels[data.status as keyof typeof purchaseStatusLabels]"
            /> </template
        ></Column>
        <Column header="Pago"
          ><template #body="{ data }">{{
            paymentStatusLabels[data.paymentStatus as keyof typeof paymentStatusLabels] ?? '—'
          }}</template></Column
        >
        <Column v-if="session.can('costs.read') && !payables" header="Total USD"
          ><template #body="{ data }">{{
            formatMoney(data.financial?.totalUsd, 'USD')
          }}</template></Column
        >
        <Column v-if="session.can('costs.read')" header="Saldo USD"
          ><template #body="{ data }">{{
            formatMoney(data.financial?.balanceUsd, 'USD')
          }}</template></Column
        >
      </DataTable>
    </section>
  </AppShell>
</template>
