<script setup lang="ts">
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import FinanceBalances from './FinanceBalances.vue';
import { financeDay } from './form';
import { getFinanceAccounts } from './service';

const result = ref<Awaited<ReturnType<typeof getFinanceAccounts>>>();
const error = ref('');
const loading = ref(false);
async function load() {
  loading.value = true;
  error.value = '';
  try {
    result.value = await getFinanceAccounts({ period: 'DAY' });
  } catch {
    error.value = 'No se pudieron cargar los saldos de las cuentas.';
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());
</script>

<template>
  <section
    class="finance-stack finance-account-balances"
    aria-labelledby="account-balances-heading"
  >
    <header class="finance-section-heading">
      <h2 id="account-balances-heading">Saldos por cuenta</h2>
      <p v-if="result">{{ financeDay(result.window.endDate) }} · {{ result.window.timezone }}</p>
    </header>
    <p v-if="loading" role="status" class="sale-muted">Cargando saldos…</p>
    <Message v-else-if="error" severity="error">
      {{ error }} <button type="button" class="inline-action" @click="load">Reintentar</button>
    </Message>
    <FinanceBalances v-else-if="result" :accounts="result.accounts" />
  </section>
</template>
