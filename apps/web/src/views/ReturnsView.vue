<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import { correctionLabel } from '../after-sale/form';
import { getCorrections } from '../after-sale/service';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { timeLabel } from '../master-data/field-types';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';

const { items, total, page, limit, loading, error, load } = usePagedList(getCorrections);
const search = ref('');
const kind = ref('');
const filters = ref<Record<string, string>>({});
function searchReturns() {
  filters.value = { q: search.value.trim(), ...(kind.value ? { kind: kind.value } : {}) };
  void load(filters.value, 1);
}
onMounted(() => void load(filters.value));
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <h1>Cambios y devoluciones</h1>
      <RouterLink :to="{ name: 'sales' }" class="p-button p-component p-button-outlined">
        <i class="pi pi-search" aria-hidden="true" /> Buscar venta original
      </RouterLink>
    </header>
    <section class="records-panel" aria-label="Historial de cambios y devoluciones">
      <form class="sale-history-filters" role="search" @submit.prevent="searchReturns">
        <div class="field sale-history-search">
          <label for="returns-search">Número de movimiento, comprobante o cliente</label>
          <InputText id="returns-search" v-model="search" maxlength="120" fluid />
        </div>
        <div class="field">
          <label for="returns-type">Tipo</label>
          <select id="returns-type" v-model="kind" class="sale-native-select">
            <option value="">Todos</option>
            <option value="RETURN">Devolución</option>
            <option value="EXCHANGE">Cambio</option>
          </select>
        </div>
        <Button type="submit" label="Filtrar" icon="pi pi-filter" variant="outlined" />
      </form>
      <Message v-if="error" severity="error" class="records-message">
        {{ error }}
        <button type="button" class="inline-action" @click="load(filters)">Reintentar</button>
      </Message>
      <DataTable
        :value="items"
        :loading="loading"
        :aria-busy="loading"
        :rows="limit"
        :first="(page - 1) * limit"
        :total-records="total"
        :paginator="total > limit"
        :table-style="{ minWidth: '45rem' }"
        data-key="id"
        lazy
        scrollable
        :pt="{
          tableContainer: { tabindex: 0, role: 'region', 'aria-label': 'Cambios y devoluciones' },
        }"
        @page="load(filters, $event.page + 1)"
      >
        <template #empty
          ><p class="records-empty" role="status">
            {{ loading ? 'Cargando movimientos…' : 'No hay movimientos para estos filtros.' }}
          </p></template
        >
        <Column header="Movimiento"
          ><template #body="{ data }">
            <RouterLink
              class="inline-action"
              :to="{ name: 'return-detail', params: { id: data.id } }"
              >{{ data.number }}</RouterLink
            >
          </template></Column
        >
        <Column header="Tipo"
          ><template #body="{ data }">{{ correctionLabel(data.kind) }}</template></Column
        >
        <Column header="Comprobante"
          ><template #body="{ data }">
            <RouterLink
              class="inline-action"
              :to="{ name: 'sale-detail', params: { id: data.originalSaleId } }"
              >{{ data.originalReceipt }}</RouterLink
            >
          </template></Column
        >
        <Column field="customerName" header="Cliente" />
        <Column header="Fecha"
          ><template #body="{ data }">{{ timeLabel(data.createdAt) }}</template></Column
        >
        <Column header="Importe devuelto"
          ><template #body="{ data }">{{ formatMoney(data.returnedUsd, 'USD') }}</template></Column
        >
      </DataTable>
    </section>
  </AppShell>
</template>
