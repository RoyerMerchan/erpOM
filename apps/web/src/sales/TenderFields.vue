<script setup lang="ts">
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { ref, watch } from 'vue';
import { textField } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { findRecord } from '../master-data/service';
import { failureMessage } from '../purchasing/form';
import type { TenderDraft } from './form';
import UsdRateField from './UsdRateField.vue';

defineProps<{
  change?: boolean;
  accountLabel?: string;
  hideReference?: boolean;
  quoteAt?: string;
}>();
const draft = defineModel<TenderDraft>({ required: true });
const currency = ref('');
const kind = ref('');
const error = ref('');
watch(
  () => draft.value.accountId,
  async (id, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    currency.value = '';
    kind.value = '';
    error.value = '';
    if (typeof id !== 'string') return;
    try {
      const entry = await findRecord('accounts', id);
      if (!current) return;
      currency.value = textField(entry, 'currencyCode');
      kind.value = textField(entry, 'kind');
    } catch (failure) {
      if (current) error.value = failureMessage(failure, 'No se pudo consultar la cuenta.');
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="sale-fields">
    <div class="field">
      <label :id="draft.key + '-account-label'" :for="draft.key + '-account'">{{
        accountLabel ?? (change ? 'Cuenta de efectivo' : 'Cuenta de cobro')
      }}</label>
      <LookupSelect
        :id="draft.key + '-account'"
        :labelled-by="draft.key + '-account-label'"
        v-model="draft.accountId"
        resource="accounts"
        clearable
        @update:model-value="draft.rate = ''"
      />
      <Message
        v-if="error || (change && kind && kind !== 'CASH')"
        severity="error"
        size="small"
        variant="simple"
      >
        {{ error || 'Selecciona una cuenta de efectivo para el vuelto.' }}
      </Message>
    </div>
    <div class="field">
      <label :for="draft.key + '-amount'">Importe{{ currency ? ' en ' + currency : '' }}</label>
      <InputText
        :id="draft.key + '-amount'"
        v-model="draft.amount"
        inputmode="decimal"
        maxlength="25"
        fluid
      />
    </div>
    <UsdRateField
      v-if="currency && currency !== 'USD'"
      :id="draft.key + '-rate'"
      :currency
      :quote-at="quoteAt"
      v-model="draft.rate"
    />
    <div v-if="!change && !hideReference" class="field">
      <label :for="draft.key + '-reference'">Referencia del cobro</label>
      <InputText :id="draft.key + '-reference'" v-model="draft.reference" maxlength="120" fluid />
    </div>
  </div>
</template>
