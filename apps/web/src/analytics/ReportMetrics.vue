<script setup lang="ts">
import type { AnalyticsMetric } from '@max-sport/shared';
import { RouterLink } from 'vue-router';
import { actionLink, formatValue } from './form';

defineProps<{ metrics: AnalyticsMetric[]; timezone: string }>();
</script>

<template>
  <dl v-if="metrics.length" class="analytics-metrics">
    <div v-for="item in metrics" :key="item.id" class="analytics-metric">
      <dt>{{ item.label }}</dt>
      <dd>
        <component
          :is="item.action ? RouterLink : 'span'"
          :to="item.action ? actionLink(item.action) : undefined"
        >
          {{ formatValue(item.value, item.format, timezone) }}
        </component>
      </dd>
      <dd v-if="item.previous !== undefined" class="analytics-comparison">
        Anterior {{ formatValue(item.previous, item.format, timezone) }}
      </dd>
    </div>
  </dl>
</template>
