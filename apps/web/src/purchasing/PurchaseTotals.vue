<script setup lang="ts">
import type { PurchasePreview } from '@max-sport/shared';
import { formatMoney } from './form';
defineProps<{
  totals: Omit<PurchasePreview, 'lines'> & {
    paidUsd?: string;
    balanceUsd?: string | null;
    balanceOriginal?: string | null;
  };
  currency: string;
}>();
</script>

<template>
  <dl class="purchase-totals">
    <div>
      <dt>Pares</dt>
      <dd>{{ totals.pairCount }}</dd>
    </div>
    <div>
      <dt>Mercancía</dt>
      <dd>{{ formatMoney(totals.subtotalOriginal, currency) }}</dd>
    </div>
    <div>
      <dt>Flete</dt>
      <dd>{{ formatMoney(totals.freightOriginal, currency) }}</dd>
    </div>
    <div>
      <dt>Total original</dt>
      <dd>{{ formatMoney(totals.totalOriginal, currency) }}</dd>
    </div>
    <div>
      <dt>Total USD</dt>
      <dd>{{ formatMoney(totals.totalUsd, 'USD') }}</dd>
    </div>
    <div v-if="totals.unitsPerUsd">
      <dt>Tasa aplicada</dt>
      <dd>1 USD = {{ formatMoney(totals.unitsPerUsd, currency) }}</dd>
    </div>
    <div v-if="totals.balanceUsd != null">
      <dt>Pagado</dt>
      <dd>{{ formatMoney(totals.paidUsd, 'USD') }}</dd>
    </div>
    <div v-if="totals.balanceUsd != null" class="purchase-balance">
      <dt>Saldo pendiente</dt>
      <dd>
        {{ formatMoney(totals.balanceUsd, 'USD') }}
        <small v-if="totals.balanceOriginal != null && currency !== 'USD'"
          >· {{ formatMoney(totals.balanceOriginal, currency) }}</small
        >
      </dd>
    </div>
  </dl>
</template>
