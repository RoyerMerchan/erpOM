<script setup lang="ts">
import type { AnalyticsBlock } from '@max-sport/shared';
import { computed, useId } from 'vue';
import { formatMoney } from '../purchasing/form';
import { formatValue } from './form';

const props = defineProps<{ trend: NonNullable<AnalyticsBlock['trend']>; timezone: string }>();
const id = useId();
const rows = computed(() =>
  Array.from(
    {
      length: Math.max(props.trend.current.length, props.trend.previous.length),
    },
    (_, index) => ({ current: props.trend.current[index], previous: props.trend.previous[index] }),
  ),
);
const range = computed(() =>
  rows.value.reduce(
    (bounds, row) => {
      const values = [Number(row.current?.value ?? 0), Number(row.previous?.value ?? 0)];
      return { min: Math.min(bounds.min, ...values), max: Math.max(bounds.max, ...values) };
    },
    { min: 0, max: 0 },
  ),
);
const height = computed(() => range.value.max - range.value.min || 1);
const baseline = computed(() => (range.value.max / height.value) * 100);
const hasData = computed(() => range.value.max !== 0 || range.value.min !== 0);
function position(amount: string) {
  const value = Number(amount);
  return {
    top: ((range.value.max - Math.max(0, value)) / height.value) * 100 + '%',
    height: (Math.abs(value) / height.value) * 100 + '%',
  };
}
function axis(date: string) {
  return new Intl.DateTimeFormat('es', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(
    new Date(date + 'T00:00:00Z'),
  );
}
</script>

<template>
  <section class="sale-panel analytics-chart" :aria-labelledby="id">
    <header class="sale-panel-header">
      <h3 :id="id">{{ trend.label }}</h3>
      <div class="analytics-legend">
        <span><i class="analytics-current" aria-hidden="true"></i> Actual</span>
        <span><i class="analytics-previous" aria-hidden="true"></i> Anterior</span>
      </div>
    </header>
    <p v-if="!hasData" class="sale-muted">
      Los dos períodos tienen un total de USD 0 por intervalo.
    </p>
    <div v-else class="analytics-chart-body">
      <div class="analytics-axis" aria-hidden="true">
        <span>{{ formatMoney(String(range.max), 'USD') }}</span>
        <span>{{ formatMoney(String(range.min), 'USD') }}</span>
      </div>
      <div class="analytics-chart-scroll">
        <div
          class="analytics-plot"
          :style="{ minWidth: Math.max(rows.length, 2) * 42 + 'px' }"
          aria-hidden="true"
        >
          <div class="analytics-zero" :style="{ top: baseline + '%' }"></div>
          <div v-for="(entry, i) in rows" :key="i" class="analytics-bucket">
            <div
              v-if="entry.current"
              class="analytics-column analytics-current"
              :style="position(entry.current.value)"
              :title="axis(entry.current.date) + ' · ' + formatMoney(entry.current.value, 'USD')"
            ></div>
            <div
              v-if="entry.previous"
              class="analytics-column analytics-previous"
              :style="position(entry.previous.value)"
              :title="axis(entry.previous.date) + ' · ' + formatMoney(entry.previous.value, 'USD')"
            ></div>
            <span v-if="entry.current || entry.previous" class="analytics-bucket-label">{{
              axis((entry.current ?? entry.previous)!.date)
            }}</span>
          </div>
        </div>
      </div>
    </div>
    <details v-if="rows.length" class="analytics-data">
      <summary>Ver valores del gráfico</summary>
      <div class="analytics-table-scroll">
        <table class="analytics-table">
          <thead>
            <tr>
              <th scope="col">Fecha actual</th>
              <th scope="col">USD actual</th>
              <th scope="col">Fecha anterior</th>
              <th scope="col">USD anterior</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in rows" :key="i">
              <td>{{ formatValue(entry.current?.date, 'DATE', timezone) }}</td>
              <td>{{ formatValue(entry.current?.value, 'USD', timezone) }}</td>
              <td>{{ formatValue(entry.previous?.date, 'DATE', timezone) }}</td>
              <td>{{ formatValue(entry.previous?.value, 'USD', timezone) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
