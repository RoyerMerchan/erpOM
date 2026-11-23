<script setup lang="ts">
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { ref, watch } from 'vue';
import { failureMessage } from '../purchasing/form';
import { getSaleRate } from './service';

const props = defineProps<{ id: string; currency: string }>();
const model = defineModel<string>({ required: true });
const loading = ref(false);
const error = ref('');
let version = 0;

watch(
  () => props.currency,
  () => {
    version++;
    loading.value = false;
    error.value = '';
  },
);

async function applyLatest() {
  const current = ++version;
  const previous = model.value;
  loading.value = true;
  error.value = '';
  try {
    const rate = await getSaleRate(props.currency);
    if (current !== version || model.value !== previous) return;
    if (rate) model.value = rate.unitsPerUsd;
    else error.value = 'Ingresa la tasa aplicada a esta operación.';
  } catch (failure) {
    if (current === version) error.value = failureMessage(failure, 'No se pudo consultar la tasa.');
  } finally {
    if (current === version) loading.value = false;
  }
}
</script>

<template>
  <div class="field sale-rate">
    <label :for="id">1 USD equivale a {{ currency }}</label>
    <div class="sale-rate-input">
      <InputText :id="id" v-model="model" inputmode="decimal" maxlength="25" fluid />
      <Button
        type="button"
        icon="pi pi-history"
        variant="outlined"
        severity="secondary"
        :loading="loading"
        aria-label="Usar la última tasa registrada"
        title="Usar la última tasa registrada"
        @click="applyLatest"
      />
    </div>
    <Message v-if="error" severity="warn" size="small" variant="simple">{{ error }}</Message>
  </div>
</template>
