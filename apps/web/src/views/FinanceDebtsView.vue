<script setup lang="ts">
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { financeMoment } from '../finance/form';
import { getFinanceDebts } from '../finance/service';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ payables?: boolean }>();
const session = useSessionStore();
const q = ref('');
const applied = ref('');
const pending = ref<string>();
let version = 0;
const { items, page, limit, total, loading, error, load } = usePagedList(async (params) => {
  const current = ++version;
  pending.value = undefined;
  const result = await getFinanceDebts(params, !!props.payables);
  if (current === version) pending.value = result.balanceUsd;
  return result;
});
const request = (next = 1) => load({ q: applied.value }, next);
function search() {
  applied.value = q.value.trim();
  void request();
}
const moment = (value: string) => financeMoment(value, session.shop?.timezone ?? 'America/Caracas');
onMounted(() => void request());
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <div>
        <h1>{{ payables ? 'Cuentas por pagar' : 'Cuentas por cobrar' }}</h1>
        <p>
          {{
            payables
              ? 'Compras recibidas con saldo a proveedor.'
              : 'Saldos pendientes de apartados abiertos.'
          }}
        </p>
      </div>
    </header>
    <dl
      v-if="pending !== undefined && !error"
      class="finance-kpis finance-debt-kpi"
      aria-live="polite"
    >
      <div>
        <dt>Saldo pendiente {{ applied ? 'de la búsqueda' : 'total' }}</dt>
        <dd>{{ formatMoney(pending, 'USD') }}</dd>
      </div>
    </dl>
    <section class="records-panel" aria-label="Documentos con saldo">
      <form class="records-toolbar" role="search" @submit.prevent="search">
        <div class="records-search">
          <InputText
            v-model="q"
            :placeholder="payables ? 'Proveedor o referencia' : 'Cliente o apartado'"
            :aria-label="payables ? 'Buscar proveedor o referencia' : 'Buscar cliente o apartado'"
            maxlength="120"
            fluid
          />
          <Button type="submit" label="Buscar" icon="pi pi-search" variant="outlined" />
        </div>
      </form>
      <Message v-if="error" severity="error" class="records-message">
        {{ error }}
        <button type="button" class="inline-action" @click="request(page)">Reintentar</button>
      </Message>
      <DataTable
        :value="items"
        :loading="loading"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        :paginator="total > limit"
        :table-style="{ minWidth: '49rem' }"
        data-key="id"
        lazy
        scrollable
        @page="request($event.page + 1)"
      >
        <template #empty
          ><p class="records-empty">
            {{
              loading ? 'Cargando documentos…' : 'No hay documentos con saldo para esta búsqueda.'
            }}
          </p></template
        >
        <Column header="Documento"
          ><template #body="{ data }">
            <RouterLink
              class="inline-action"
              :to="{
                name: payables ? 'purchase-detail' : 'layaway-detail',
                params: { id: data.id },
              }"
              >{{ data.number }}</RouterLink
            >
          </template></Column
        >
        <Column field="partyName" :header="payables ? 'Proveedor' : 'Cliente'" />
        <Column header="Fecha"
          ><template #body="{ data }">{{ moment(data.occurredAt) }}</template></Column
        >
        <Column v-if="!payables" header="Vencimiento"
          ><template #body="{ data }">
            {{ data.dueAt ? moment(data.dueAt) : '—'
            }}<strong v-if="data.overdue" class="activity-overdue">Vencido</strong>
          </template></Column
        >
        <Column header="Total"
          ><template #body="{ data }">{{ formatMoney(data.totalUsd, 'USD') }}</template></Column
        >
        <Column header="Pagado"
          ><template #body="{ data }">{{ formatMoney(data.paidUsd, 'USD') }}</template></Column
        >
        <Column header="Saldo por liquidar"
          ><template #body="{ data }"
            ><strong>{{ formatMoney(data.balanceUsd, 'USD') }}</strong></template
          ></Column
        >
      </DataTable>
    </section>
  </AppShell>
</template>
