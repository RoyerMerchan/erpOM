<script setup lang="ts">
import { analyticsSection, analyticsSectionLabels, analyticsSectionsFor } from '@max-sport/shared';
import type { AnalyticsResponse, AnalyticsSection } from '@max-sport/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { failureMessage } from '../purchasing/form';
import { useSessionStore } from '../stores/session';
import {
  dashboardDetailMetricIds,
  dashboardMetrics,
  dashboardTableIds,
  formatValue,
  overviewMetricIds,
  reportDraft,
  reportParams,
} from './form';
import ReportChart from './ReportChart.vue';
import ReportFilters from './ReportFilters.vue';
import ReportMetrics from './ReportMetrics.vue';
import ReportTable from './ReportTable.vue';
import { downloadReport, getAnalytics } from './service';

const props = defineProps<{ dashboard?: boolean }>();
const session = useSessionStore();
const route = useRoute();
const allowed = computed(() => analyticsSectionsFor(session.user?.permissions ?? []));
const requested = analyticsSection.safeParse(route.query.section);
const section = ref<AnalyticsSection | undefined>(
  props.dashboard
    ? undefined
    : requested.success && allowed.value.includes(requested.data)
      ? requested.data
      : allowed.value[0],
);
const draft = ref(reportDraft(route.query));
const result = ref<AnalyticsResponse>();
const filters = ref<Record<string, string>>({});
const loading = ref(false);
const exporting = ref<'CSV' | 'XLSX' | 'PDF'>();
const error = ref('');
const exportError = ref('');
let revision = 0;
const timezone = computed(() => result.value?.window.timezone ?? 'America/Caracas');
const mainMetrics = computed(() =>
  result.value ? dashboardMetrics(result.value.sections, overviewMetricIds, filters.value) : [],
);
const charts = computed(
  () =>
    result.value?.sections.flatMap(({ section, trend }) => (trend ? [{ section, trend }] : [])) ??
    [],
);
const titles = analyticsSectionLabels;
const period = computed(() => {
  if (!result.value) return '';
  const date = (value: string) => formatValue(value, 'DATE', timezone.value);
  const { window, comparison } = result.value;
  return (
    date(window.startDate) +
    (window.startDate === window.endDate ? '' : ' a ' + date(window.endDate)) +
    ' · Anterior ' +
    date(comparison.startDate) +
    (comparison.startDate === comparison.endDate ? '' : ' a ' + date(comparison.endDate))
  );
});

async function refresh() {
  const current = ++revision;
  const input = reportParams(draft.value, section.value);
  loading.value = true;
  error.value = '';
  exportError.value = '';
  try {
    const data = await getAnalytics(input);
    if (current !== revision) return;
    result.value = data;
    filters.value = input;
  } catch (failure) {
    if (current !== revision) return;
    result.value = undefined;
    error.value = failureMessage(failure, 'No se pudo cargar el informe.');
  } finally {
    if (current === revision) loading.value = false;
  }
}
function clear() {
  draft.value = reportDraft();
  void refresh();
}
function show(tab: AnalyticsSection) {
  if (section.value === tab) return;
  section.value = tab;
  result.value = undefined;
  void refresh();
}
async function exportFile(format: 'CSV' | 'XLSX' | 'PDF') {
  if (!result.value || !section.value || exporting.value) return;
  exporting.value = format;
  exportError.value = '';
  try {
    await downloadReport(filters.value, format);
  } catch (failure) {
    exportError.value = failureMessage(failure, 'No se pudo exportar el reporte.');
  } finally {
    exporting.value = undefined;
  }
}
onMounted(() => void refresh());
onBeforeUnmount(() => {
  revision++;
});
</script>

<template>
  <AppShell>
    <header class="module-heading analytics-heading">
      <div>
        <h1>{{ dashboard ? 'Panel de operaciones' : 'Reportes' }}</h1>
        <p v-if="period">{{ period }} · {{ timezone }}</p>
      </div>
      <RouterLink
        v-if="dashboard"
        class="p-button p-component p-button-outlined"
        :to="{ name: 'reports', query: filters }"
      >
        <i class="pi pi-chart-bar" aria-hidden="true" /> Ver reportes
      </RouterLink>
      <div v-else-if="session.can('analytics.export')" class="sale-actions">
        <Button
          v-for="format in ['CSV', 'XLSX', 'PDF'] as const"
          :key="format"
          type="button"
          :label="'Descargar ' + format"
          icon="pi pi-download"
          size="small"
          variant="outlined"
          :disabled="!result || loading || !!exporting"
          :loading="exporting === format"
          @click="exportFile(format)"
        />
      </div>
    </header>

    <nav v-if="!dashboard" class="analytics-tabs" aria-label="Tipos de reporte">
      <Button
        v-for="tab in allowed"
        :key="tab"
        type="button"
        :label="titles[tab]"
        size="small"
        :variant="section === tab ? undefined : 'text'"
        :aria-pressed="section === tab"
        @click="show(tab)"
      />
    </nav>
    <ReportFilters v-model="draft" :section :busy="loading" @apply="refresh" @clear="clear" />
    <Message v-if="error || exportError" severity="error" class="activity-message">
      {{ error || exportError }}
      <button v-if="error" type="button" class="inline-action" @click="refresh">Reintentar</button>
    </Message>
    <p v-if="loading && !result" class="sale-muted" role="status">Cargando datos…</p>
    <div v-if="result" class="analytics-content" :aria-busy="loading">
      <template v-if="dashboard">
        <ReportMetrics :metrics="mainMetrics" :timezone />
        <div v-if="charts.length" class="analytics-two-up">
          <ReportChart v-for="item in charts" :key="item.section" :trend="item.trend" :timezone />
        </div>
        <section
          v-for="block in result.sections.filter(({ tables }) =>
            tables.some((table) => dashboardTableIds.has(table.id)),
          )"
          :key="block.section"
          class="analytics-content"
        >
          <header class="sale-panel-header analytics-section-header">
            <h2>{{ titles[block.section] }}</h2>
            <RouterLink
              class="inline-action"
              :to="{ name: 'reports', query: { ...filters, section: block.section } }"
            >
              Ver reporte de {{ titles[block.section].toLowerCase() }}
            </RouterLink>
          </header>
          <ReportMetrics
            :metrics="dashboardMetrics([block], dashboardDetailMetricIds, filters)"
            :timezone
          />
          <div class="analytics-two-up">
            <ReportTable
              v-for="table in block.tables.filter((table) => dashboardTableIds.has(table.id))"
              :key="table.id"
              :table
              :timezone
              :preview="6"
            />
          </div>
        </section>
      </template>
      <template v-else>
        <section v-for="block in result.sections" :key="block.section" class="analytics-content">
          <p
            v-if="block.section === 'SALES' || block.section === 'RETURNS'"
            class="sale-muted analytics-scope"
          >
            Las ventas se reconocen en su fecha de confirmación y las rectificaciones en su fecha de
            registro. El filtro de cuenta, moneda o método selecciona los comprobantes asociados.
          </p>
          <p v-else-if="block.section === 'CASH'" class="sale-muted analytics-scope">
            Los importes de caja se agrupan por fecha de movimiento, cuenta y moneda.
          </p>
          <p
            v-else-if="['STOCK', 'PURCHASES', 'LAYAWAYS'].includes(block.section)"
            class="sale-muted analytics-scope"
          >
            Las existencias, los estados y los saldos pendientes corresponden al momento de la
            consulta.
          </p>
          <ReportMetrics :metrics="block.metrics" :timezone />
          <ReportChart v-if="block.trend" :trend="block.trend" :timezone />
          <ReportTable v-for="table in block.tables" :key="table.id" :table :timezone />
        </section>
      </template>
    </div>
  </AppShell>
</template>
