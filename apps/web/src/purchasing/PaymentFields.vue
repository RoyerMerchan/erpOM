<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { ref, watch } from 'vue';
import LookupSelect from '../master-data/LookupSelect.vue';
import { findRecord } from '../master-data/service';
import { asDate, failureMessage } from './form';
import type { PaymentDraft } from './form';
import { getQuote } from './service';

defineProps<{ disabled?: boolean }>();
const model = defineModel<PaymentDraft>({ required: true });
const currency = defineModel<string>('currency', { required: true });
const error = ref('');
const reading = ref(false);

watch(
  () => model.value.accountId,
  async (accountId, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    currency.value = '';
    model.value.rate = '';
    reading.value = false;
    error.value = '';
    if (typeof accountId !== 'string' || !accountId) return;
    reading.value = true;
    try {
      const account = await findRecord('accounts', accountId);
      if (current) currency.value = String(account.currencyCode);
    } catch (failure) {
      if (current)
        error.value = failureMessage(failure, 'No se pudo consultar la moneda de la cuenta.');
    } finally {
      if (current) reading.value = false;
    }
  },
  { immediate: true },
);

async function fillRate() {
  const code = currency.value;
  const at = asDate(model.value.paidAt);
  if (!code || !at) return;
  reading.value = true;
  error.value = '';
  try {
    const quote = await getQuote(code, at);
    if (code !== currency.value || at !== asDate(model.value.paidAt)) return;
    if (quote) model.value.rate = quote.unitsPerUsd;
    else error.value = 'Ingresa la tasa explícita que se aplicó a este pago.';
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo consultar la tasa.');
  } finally {
    reading.value = false;
  }
}
</script>

<template>
  <div class="record-fields">
    <div class="record-field">
      <label for="supplier-payment-account">Cuenta de salida</label>
      <LookupSelect
        id="supplier-payment-account"
        v-model="model.accountId"
        resource="accounts"
        :disabled="disabled"
      />
    </div>
    <div class="record-field">
      <label for="supplier-payment-date">Fecha del pago</label>
      <InputText
        id="supplier-payment-date"
        v-model="model.paidAt"
        type="datetime-local"
        step="1"
        :disabled="disabled"
        fluid
      />
    </div>
    <div class="record-field">
      <label for="supplier-payment-amount">Importe {{ currency }}</label>
      <InputText
        id="supplier-payment-amount"
        v-model="model.amount"
        inputmode="decimal"
        maxlength="25"
        :disabled="disabled"
        fluid
      />
    </div>
    <div v-if="currency && currency !== 'USD'" class="record-field">
      <label for="supplier-payment-rate">1 USD = X {{ currency }}</label>
      <InputText
        id="supplier-payment-rate"
        v-model="model.rate"
        inputmode="decimal"
        maxlength="31"
        :disabled="disabled"
        fluid
      />
      <Button
        type="button"
        label="Cargar tasa registrada"
        size="small"
        text
        class="procurement-inline"
        :loading="reading"
        :disabled="disabled || reading"
        @click="fillRate"
      />
    </div>
    <div class="record-field">
      <label for="supplier-payment-reference">Referencia</label>
      <InputText
        id="supplier-payment-reference"
        v-model="model.reference"
        maxlength="120"
        :disabled="disabled"
        fluid
      />
    </div>
  </div>
  <Message v-if="error" severity="error">{{ error }}</Message>
</template>
