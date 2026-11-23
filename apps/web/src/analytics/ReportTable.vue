<script setup lang="ts">
import type { AnalyticsTable } from '@max-sport/shared';
import { computed, useId } from 'vue';
import { actionLink, formatValue } from './form';

const props = defineProps<{ table: AnalyticsTable; timezone: string; preview?: number }>();
const id = useId();
const rows = computed(() =>
  props.preview ? props.table.rows.slice(0, props.preview) : props.table.rows,
);
const total = computed(() => props.table.rowCount ?? props.table.rows.length);
</script>

<template>
  <section class="sale-panel analytics-table-panel" :aria-labelledby="id">
    <header class="sale-panel-header">
      <h3 :id="id">{{ table.title }}</h3>
    </header>
    <p v-if="!rows.length" class="sale-muted">Sin registros para los filtros aplicados.</p>
    <template v-else>
      <div class="analytics-table-scroll">
        <table class="analytics-table" :aria-labelledby="id">
          <thead>
            <tr>
              <th
                v-for="(column, i) in table.columns"
                :key="i"
                scope="col"
                :class="{ 'is-number': ['USD', 'COUNT', 'PERCENT'].includes(column.format) }"
              >
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, i) in rows" :key="i">
              <td
                v-for="(column, j) in table.columns"
                :key="j"
                :class="{ 'is-number': ['USD', 'COUNT', 'PERCENT'].includes(column.format) }"
              >
                <RouterLink
                  v-if="j === 0 && entry.action"
                  class="inline-action"
                  :to="actionLink(entry.action)"
                >
                  {{ formatValue(entry.cells[j], column.format, timezone) }}
                </RouterLink>
                <template v-else>{{
                  formatValue(entry.cells[j], column.format, timezone)
                }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="total > rows.length" class="sale-muted">
        Se muestran {{ rows.length }} de {{ total }} registros.
      </p>
    </template>
  </section>
</template>
