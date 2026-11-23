<script setup lang="ts">
import { financeLedgerFilterLabels, financeReportQuery } from '@max-sport/shared';
import type { FinanceLedgerQuery, FinanceLedgerRow, FinanceWindow } from '@max-sport/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import FinanceCategoryManager from '../finance/FinanceCategoryManager.vue';
import FinanceCategorySelect from '../finance/FinanceCategorySelect.vue';
import FinanceFilters from '../finance/FinanceFilters.vue';
import {
  filterParams,
  financeDay,
  financeFiltersDraft,
  financeMoment,
  movementLabel,
  sourceRoute,
} from '../finance/form';
import { getFinanceLedger } from '../finance/service';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ view: 'all' | 'manual' | 'expenses' }>();
const session = useSessionStore();
const route = useRoute();
const initial = financeReportQuery.safeParse(route.query);
const draft = ref(financeFiltersDraft());
if (initial.success)
  Object.assign(
    draft.value,
    Object.fromEntries(Object.entries(initial.data).filter(([, value]) => value != null)),
  );
const filter = ref<FinanceLedgerQuery['filter']>();
const category = ref<string | null>(null);
const q = ref('');
const managing = ref(false);
const categoryRevision = ref(0);
const applied = ref<Record<string, string>>({});
const window = ref<FinanceWindow>();
let revision = 0;
const { items, total, limit, page, error, loading, load } = usePagedList<FinanceLedgerRow>(
  async (query) => {
    const current = ++revision;
    const result = await getFinanceLedger(query);
    if (revision === current) window.value = result.window;
    return result;
  },
);
const heading = computed(
  () => ({ all: 'Movimientos', manual: 'Ingresos y egresos', expenses: 'Gastos' })[props.view],
);
const options = computed(() =>
  Object.entries(financeLedgerFilterLabels).filter(([key]) =>
    props.view === 'all'
      ? key !== 'MANUAL'
      : ['EXPENSE', 'OTHER_INCOME', 'TRANSFER', 'ADJUSTMENT'].includes(key),
  ),
);
const titleDate = computed(() => {
  const current = window.value;
  if (!current) return '';
  return (
    (current.startDate === current.endDate
      ? financeDay(current.startDate)
      : financeDay(current.startDate) + ' – ' + financeDay(current.endDate)) +
    ' · ' +
    current.timezone
  );
});
function apply() {
  const filteredKind =
    props.view === 'expenses'
      ? 'EXPENSE'
      : filter.value || (props.view === 'manual' ? 'MANUAL' : undefined);
  applied.value = {
    ...filterParams(draft.value),
    q: q.value.trim(),
    ...(filteredKind ? { filter: filteredKind } : {}),
    ...(props.view === 'expenses' && category.value ? { categoryId: category.value } : {}),
  };
  void load(applied.value, 1);
}
onMounted(apply);
watch(managing, (visible) => {
  if (!visible) categoryRevision.value++;
});
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <div>
        <h1>{{ heading }}</h1>
        <p v-if="titleDate">{{ titleDate }}</p>
      </div>
      <div class="sale-actions">
        <Button
          v-if="view === 'expenses' && session.can('finance.categories.manage')"
          type="button"
          label="Categorías"
          icon="pi pi-tag"
          variant="outlined"
          @click="managing = true"
        />
        <RouterLink
          v-if="session.can('finance.post')"
          class="p-button p-component"
          :to="{ name: 'finance-new', query: view === 'expenses' ? { kind: 'EXPENSE' } : {} }"
        >
          <i class="pi pi-plus" aria-hidden="true" />
          {{ view === 'expenses' ? 'Registrar gasto' : 'Registrar movimiento' }}
        </RouterLink>
      </div>
    </header>

    <form class="sale-panel finance-filter" role="search" @submit.prevent="apply">
      <FinanceFilters v-model="draft" />
      <div class="finance-fields">
        <div class="field">
          <label for="journal-q">Referencia, concepto o cuenta</label>
          <InputText id="journal-q" v-model="q" maxlength="120" fluid />
        </div>
        <div v-if="view !== 'expenses'" class="field">
          <label for="journal-kind">Tipo de movimiento</label>
          <select id="journal-kind" v-model="filter" class="sale-native-select">
            <option :value="undefined">Todos</option>
            <option v-for="[value, label] in options" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
        </div>
        <div v-else class="field">
          <label for="journal-category">Categoría de gasto</label>
          <FinanceCategorySelect
            :key="categoryRevision"
            id="journal-category"
            v-model="category"
            include-archived
            clearable
          />
        </div>
      </div>
      <Button
        type="submit"
        label="Filtrar"
        icon="pi pi-filter"
        variant="outlined"
        :loading="loading"
      />
    </form>

    <section class="records-panel" aria-label="Registro de movimientos">
      <Message v-if="error" severity="error" class="records-message">
        {{ error }}
        <button type="button" class="inline-action" @click="load(applied, page)">Reintentar</button>
      </Message>
      <DataTable
        :value="items"
        :loading="loading"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        :paginator="total > limit"
        :table-style="{ minWidth: '60rem' }"
        data-key="id"
        lazy
        scrollable
        @page="load(applied, $event.page + 1)"
      >
        <template #empty
          ><p class="records-empty">
            {{ loading ? 'Cargando movimientos…' : 'No hay movimientos para estos filtros.' }}
          </p></template
        >
        <Column header="Fecha y responsable"
          ><template #body="{ data }">
            <div class="finance-table-label">
              {{ financeMoment(data.occurredAt, window?.timezone ?? 'America/Caracas')
              }}<span>{{ data.actorName }}</span>
            </div>
          </template></Column
        >
        <Column header="Tipo y referencia"
          ><template #body="{ data }">
            <div class="finance-table-label">
              <RouterLink :to="sourceRoute(data)" class="inline-action">{{
                movementLabel(data)
              }}</RouterLink>
              <span v-if="data.categoryName">{{ data.categoryName }}</span>
              <span v-if="data.reference || data.description">{{
                data.reference || data.description
              }}</span>
            </div>
          </template></Column
        >
        <Column field="accountName" header="Cuenta" />
        <Column header="Importe original"
          ><template #body="{ data }">
            <strong :class="{ 'finance-in': data.direction === 'IN' }"
              >{{ data.direction === 'IN' ? '+' : '−'
              }}{{ formatMoney(data.amountOriginal, data.currencyCode) }}</strong
            >
          </template></Column
        >
        <Column header="Tasa por USD"
          ><template #body="{ data }">{{
            formatMoney(data.unitsPerUsd, data.currencyCode)
          }}</template></Column
        >
        <Column header="USD histórico"
          ><template #body="{ data }"
            >{{ data.direction === 'IN' ? '+' : '−'
            }}{{ formatMoney(data.amountUsd, 'USD') }}</template
          ></Column
        >
      </DataTable>
    </section>
    <FinanceCategoryManager v-if="session.can('finance.categories.manage')" v-model="managing" />
  </AppShell>
</template>
