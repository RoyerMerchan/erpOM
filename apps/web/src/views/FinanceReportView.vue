<script setup lang="ts">
import type { FinanceReport } from '@max-sport/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import FinanceBalances from '../finance/FinanceBalances.vue';
import FinanceFilters from '../finance/FinanceFilters.vue';
import { filterParams, financeDay, financeFiltersDraft } from '../finance/form';
import { getFinanceReport } from '../finance/service';
import { failureMessage, formatMoney } from '../purchasing/form';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ view: 'summary' | 'profit' | 'daily' }>();
const session = useSessionStore();
const filters = ref(financeFiltersDraft());
const applied = ref<Record<string, string>>();
const report = ref<FinanceReport>();
const loading = ref(false);
const error = ref('');
let version = 0;
const heading = computed(
  () =>
    ({
      summary: 'Resumen financiero',
      profit: 'Rentabilidad',
      daily: 'Reporte diario',
    })[props.view],
);
const dates = computed(() => {
  if (!report.value) return '';
  const { startDate, endDate, timezone } = report.value.window;
  return (
    (startDate === endDate
      ? financeDay(startDate)
      : financeDay(startDate) + ' – ' + financeDay(endDate)) +
    ' · ' +
    timezone
  );
});
const recognition = computed(() => {
  const values = report.value?.recognition;
  return values
    ? [
        { label: 'Ventas antes de descuentos', value: values.grossSalesUsd },
        { label: 'Descuentos', value: values.discountsUsd },
        { label: 'Importe de devoluciones', value: values.returnedUsd },
        { label: 'Ventas netas', value: values.netSalesUsd, important: true },
        { label: 'Costo de ventas FIFO', value: values.cogsUsd },
        { label: 'Utilidad bruta', value: values.grossProfitUsd, important: true },
        { label: 'Gasto operativo', value: values.expensesUsd },
        { label: 'Utilidad neta estimada', value: values.netProfitUsd, important: true },
      ].filter(({ value }) => value !== undefined)
    : [];
});
const cash = computed(() => {
  const values = report.value?.cash;
  return values
    ? [
        { label: 'Cobros de ventas y cambios', value: values.salesCollectedUsd },
        { label: 'Anticipos de apartados', value: values.advancesCollectedUsd },
        { label: 'Otros ingresos netos', value: values.otherIncomeUsd },
        { label: 'Pagos netos a proveedores', value: values.supplierNetUsd },
        { label: 'Gastos netos pagados', value: values.expensesUsd },
        { label: 'Reembolsos', value: values.refundsUsd },
        { label: 'Vuelto entregado', value: values.changeUsd },
        { label: 'Entradas de caja operativa', value: values.cashInUsd },
        { label: 'Salidas de caja operativa', value: values.cashOutUsd },
        { label: 'Flujo de caja operativo', value: values.cashFlowUsd, important: true },
        { label: 'Efecto de transferencias', value: values.transferNetUsd },
        { label: 'Ajustes netos', value: values.adjustmentsNetUsd },
        { label: 'Variación de saldos', value: values.accountNetUsd, important: true },
      ]
    : [];
});

async function load() {
  const current = ++version;
  const params = filterParams(filters.value);
  loading.value = true;
  error.value = '';
  try {
    const result = await getFinanceReport(params, props.view === 'daily');
    if (current !== version) return;
    report.value = result;
    applied.value = {
      ...params,
      ...(params.date || !params.period || params.period === 'RANGE'
        ? {}
        : { date: result.window.startDate }),
    };
  } catch (failure) {
    if (current !== version) return;
    report.value = undefined;
    error.value = failureMessage(failure, 'No se pudo consultar el reporte.');
  } finally {
    if (current === version) loading.value = false;
  }
}
const printReport = () => window.print();
onMounted(() => void load());
onBeforeUnmount(() => {
  version++;
});
</script>

<template>
  <AppShell>
    <div :class="{ 'finance-daily-sheet': view === 'daily' && !!report }">
      <div class="finance-screen-only"><SectionLinks /></div>
      <header class="module-heading">
        <div>
          <h1>{{ heading }}</h1>
          <p v-if="dates">{{ dates }}</p>
        </div>
        <div class="sale-actions finance-screen-only">
          <Button
            v-if="view === 'daily' && report"
            label="Imprimir reporte"
            icon="pi pi-print"
            variant="outlined"
            @click="printReport"
          />
          <RouterLink
            v-if="view === 'summary' && session.can('finance.post')"
            :to="{ name: 'finance-new' }"
            class="p-button p-component"
          >
            <i class="pi pi-plus" aria-hidden="true" /> Registrar movimiento
          </RouterLink>
        </div>
      </header>

      <form class="sale-panel finance-filter finance-screen-only" @submit.prevent="load">
        <FinanceFilters
          v-model="filters"
          :daily="view === 'daily'"
          :dates-only="view === 'profit'"
        />
        <Button
          type="submit"
          label="Consultar"
          icon="pi pi-filter"
          variant="outlined"
          :loading="loading"
        />
      </form>
      <Message v-if="error" severity="error" class="activity-message">
        {{ error }} <button type="button" class="inline-action" @click="load">Reintentar</button>
      </Message>
      <p v-else-if="loading && !report" class="sale-muted" role="status">Cargando reporte…</p>

      <div v-if="report" class="finance-stack" :aria-busy="loading">
        <dl v-if="view !== 'profit'" class="finance-kpis">
          <div>
            <dt>Ventas netas de la tienda</dt>
            <dd>{{ formatMoney(report.recognition.netSalesUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>Cobros y anticipos</dt>
            <dd>{{ formatMoney(report.cash.collectedUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>Egresos de caja</dt>
            <dd>{{ formatMoney(report.cash.cashOutUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>Flujo de caja operativo</dt>
            <dd>{{ formatMoney(report.cash.cashFlowUsd, 'USD') }}</dd>
          </div>
        </dl>

        <p
          v-if="view !== 'profit' && (applied?.accountId || applied?.currencyCode)"
          class="sale-muted"
        >
          Las ventas corresponden a toda la tienda. El filtro de cuenta o moneda se aplica a caja.
        </p>
        <component
          :is="view === 'summary' ? 'details' : 'div'"
          :class="{ 'sale-panel finance-filter-extra': view === 'summary' }"
        >
          <summary v-if="view === 'summary'">Ver desglose de resultados y caja</summary>
          <div :class="{ 'finance-two-up': view !== 'profit' }">
            <section class="sale-panel finance-stack" aria-labelledby="finance-recognition">
              <header class="finance-section-heading">
                <h2 id="finance-recognition">Resultados de la tienda</h2>
                <p>Ventas reconocidas y gastos del período para toda la tienda.</p>
              </header>
              <dl class="finance-metrics">
                <div
                  v-for="item in recognition"
                  :key="item.label"
                  :class="{ 'finance-metric-total': item.important }"
                >
                  <dt>{{ item.label }}</dt>
                  <dd>{{ formatMoney(item.value, 'USD') }}</dd>
                </div>
                <div>
                  <dt>Ventas confirmadas</dt>
                  <dd>{{ report.recognition.salesCount }}</dd>
                </div>
                <div v-if="report.recognition.grossMarginPct != null">
                  <dt>Margen bruto</dt>
                  <dd>{{ formatMoney(report.recognition.grossMarginPct) }} %</dd>
                </div>
              </dl>
            </section>
            <section
              v-if="view !== 'profit'"
              class="sale-panel finance-stack"
              aria-labelledby="finance-cash"
            >
              <header class="finance-section-heading">
                <h2 id="finance-cash">Conciliación de caja</h2>
                <p>Movimientos del período para las cuentas y monedas seleccionadas.</p>
              </header>
              <dl class="finance-metrics">
                <div
                  v-for="item in cash"
                  :key="item.label"
                  :class="{ 'finance-metric-total': item.important }"
                >
                  <dt>{{ item.label }}</dt>
                  <dd>{{ formatMoney(item.value, 'USD') }}</dd>
                </div>
              </dl>
            </section>
          </div>
        </component>

        <section v-if="view !== 'profit'" class="finance-stack" aria-labelledby="finance-balances">
          <header class="finance-section-heading">
            <h2 id="finance-balances">Saldos por cuenta</h2>
          </header>
          <FinanceBalances :accounts="report.accounts" :filters="applied" />
        </section>
        <section class="sale-panel finance-stack" aria-labelledby="finance-expenses">
          <header class="finance-section-heading">
            <h2 id="finance-expenses">Gastos por categoría</h2>
          </header>
          <dl v-if="report.expenseCategories.length" class="finance-metrics">
            <div v-for="category in report.expenseCategories" :key="category.id">
              <dt>{{ category.name }}</dt>
              <dd>{{ formatMoney(category.usd, 'USD') }}</dd>
            </div>
          </dl>
          <p v-else class="sale-muted">No hay gastos para los filtros aplicados.</p>
        </section>
      </div>
    </div>
  </AppShell>
</template>
