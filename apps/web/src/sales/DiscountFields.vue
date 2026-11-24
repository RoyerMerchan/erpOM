<script setup lang="ts">
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import LookupSelect from '../master-data/LookupSelect.vue';
import type { DiscountDraft } from './form';
import UsdRateField from './UsdRateField.vue';

defineProps<{ id: string }>();
const draft = defineModel<DiscountDraft>({ required: true });
const options = [
  { value: 'NONE', label: 'Sin descuento' },
  { value: 'PERCENT', label: 'Porcentaje' },
  { value: 'FIXED', label: 'Importe fijo' },
];
</script>

<template>
  <div class="sale-fields">
    <div class="field">
      <label :id="id + '-label'" :for="id">Tipo de descuento</label>
      <Select
        :input-id="id"
        :aria-labelledby="id + '-label'"
        v-model="draft.kind"
        :options="options"
        option-label="label"
        option-value="value"
        fluid
        @change="draft.value = ''"
      />
    </div>
    <div v-if="draft.kind !== 'NONE'" class="field">
      <label :for="id + '-value'">{{
        draft.kind === 'PERCENT' ? 'Porcentaje (%)' : 'Importe'
      }}</label>
      <InputText
        :id="id + '-value'"
        v-model="draft.value"
        inputmode="decimal"
        maxlength="25"
        fluid
      />
    </div>
    <template v-if="draft.kind === 'FIXED'">
      <div class="field">
        <label :id="id + '-currency-label'" :for="id + '-currency'">Moneda</label>
        <LookupSelect
          :id="id + '-currency'"
          :labelled-by="id + '-currency-label'"
          v-model="draft.currency"
          resource="currencies"
          @update:model-value="draft.rate = ''"
        />
      </div>
      <UsdRateField
        v-if="typeof draft.currency === 'string' && draft.currency !== 'USD'"
        :id="id + '-rate'"
        :currency="draft.currency"
        v-model="draft.rate"
      />
    </template>
  </div>
</template>
