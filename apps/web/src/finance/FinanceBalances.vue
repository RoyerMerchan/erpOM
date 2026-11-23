<script setup lang="ts">
import type { FinanceAccount } from '@max-sport/shared';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import { formatMoney } from '../purchasing/form';

defineProps<{
  accounts: FinanceAccount[];
  hideLinks?: boolean;
  filters?: Record<string, string>;
}>();
</script>

<template>
  <div class="records-panel finance-balance-table">
    <DataTable :value="accounts" :table-style="{ minWidth: '45rem' }" data-key="id" scrollable>
      <template #empty><p class="records-empty">No hay cuentas para estos filtros.</p></template>
      <Column header="Cuenta">
        <template #body="{ data }">
          <div class="finance-table-label">
            <RouterLink
              v-if="!hideLinks"
              class="inline-action"
              :to="{ name: 'finance-movements', query: { ...filters, accountId: data.id } }"
              >{{ data.name }}</RouterLink
            >
            <strong v-else>{{ data.name }}</strong>
            <span
              >{{ data.currencyCode }}<template v-if="!data.active"> · Archivada</template></span
            >
          </div>
        </template>
      </Column>
      <Column header="Saldo inicial"
        ><template #body="{ data }">{{
          formatMoney(data.openingOriginal, data.currencyCode)
        }}</template></Column
      >
      <Column header="Entradas"
        ><template #body="{ data }">{{
          formatMoney(data.incomingOriginal, data.currencyCode)
        }}</template></Column
      >
      <Column header="Salidas"
        ><template #body="{ data }">{{
          formatMoney(data.outgoingOriginal, data.currencyCode)
        }}</template></Column
      >
      <Column header="Saldo al corte"
        ><template #body="{ data }"
          ><strong>{{ formatMoney(data.closingOriginal, data.currencyCode) }}</strong></template
        ></Column
      >
      <Column header="Valor histórico USD"
        ><template #body="{ data }">{{ formatMoney(data.closingUsd, 'USD') }}</template></Column
      >
    </DataTable>
  </div>
</template>
