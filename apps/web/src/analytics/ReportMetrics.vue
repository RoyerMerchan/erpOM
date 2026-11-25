<script setup lang="ts">
import type { AnalyticsMetric } from '@max-sport/shared';
import { RouterLink } from 'vue-router';
import { actionLink, formatValue } from './form';

defineProps<{
  metrics: AnalyticsMetric[];
  timezone: string;
  compact?: boolean;
  hideComparison?: boolean;
}>();

const icons: Record<string, string> = {
  'net-sales': 'pi-chart-line',
  collectedUsd: 'pi-wallet',
  'sales-count': 'pi-shopping-cart',
  'average-ticket': 'pi-tag',
  'net-profit': 'pi-chart-bar',
  margin: 'pi-percentage',
  'stock-available': 'pi-box',
};
</script>

<template>
  <dl
    v-if="metrics.length"
    class="analytics-metrics"
    :class="{ 'analytics-metrics-compact': compact }"
  >
    <div v-for="item in metrics" :key="item.id" class="analytics-metric">
      <dt>
        <i
          v-if="!compact && icons[item.id]"
          class="pi analytics-metric-icon"
          :class="icons[item.id]"
          aria-hidden="true"
        />
        <span>{{ item.label }}</span>
      </dt>
      <dd>
        <component
          :is="item.action ? RouterLink : 'span'"
          :to="item.action ? actionLink(item.action) : undefined"
          :aria-label="
            item.action
              ? item.label + ', ' + formatValue(item.value, item.format, timezone)
              : undefined
          "
        >
          {{ formatValue(item.value, item.format, timezone) }}
          <i
            v-if="item.action"
            class="pi pi-arrow-up-right analytics-metric-link"
            aria-hidden="true"
          />
        </component>
      </dd>
      <dd v-if="!hideComparison && item.previous !== undefined" class="analytics-comparison">
        Anterior {{ formatValue(item.previous, item.format, timezone) }}
      </dd>
    </div>
  </dl>
</template>
