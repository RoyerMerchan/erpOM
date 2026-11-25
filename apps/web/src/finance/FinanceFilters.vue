<script setup lang="ts">
import { financePeriodLabels } from '@max-sport/shared';
import InputText from 'primevue/inputtext';
import { useId } from 'vue';
import LookupSelect from '../master-data/LookupSelect.vue';
import type { FinanceFilterDraft } from './form';

defineProps<{ daily?: boolean; datesOnly?: boolean; accountsOnly?: boolean }>();
const model = defineModel<FinanceFilterDraft>({ required: true });
const id = useId();
</script>

<template>
  <div class="finance-fields">
    <div v-if="!daily && !accountsOnly" class="field">
      <label :for="id + '-period'">Período</label>
      <select :id="id + '-period'" v-model="model.period" class="sale-native-select">
        <option v-for="(title, period) in financePeriodLabels" :key="period" :value="period">
          {{ title }}
        </option>
      </select>
    </div>
    <template v-if="!accountsOnly && model.period === 'RANGE' && !daily">
      <div class="field">
        <label :for="id + '-from'">Desde</label>
        <InputText :id="id + '-from'" type="date" v-model="model.from" required fluid />
      </div>
      <div class="field">
        <label :for="id + '-to'">Hasta</label>
        <InputText
          :id="id + '-to'"
          type="date"
          v-model="model.to"
          :min="model.from || undefined"
          required
          fluid
        />
      </div>
    </template>
    <div v-else-if="!accountsOnly" class="field">
      <label :for="id + '-date'">{{
        daily || model.period === 'DAY' ? 'Fecha' : 'Fecha del período'
      }}</label>
      <InputText :id="id + '-date'" type="date" v-model="model.date" fluid />
    </div>
    <template v-if="!datesOnly">
      <div class="field">
        <label :id="id + '-currency-label'" :for="id + '-currency'">Moneda de caja</label>
        <LookupSelect
          :id="id + '-currency'"
          :labelled-by="id + '-currency-label'"
          v-model="model.currencyCode"
          resource="currencies"
          placeholder="Todas"
          clearable
          include-archived
        />
      </div>
      <div class="field">
        <label :id="id + '-account-label'" :for="id + '-account'">Cuenta de caja</label>
        <LookupSelect
          :id="id + '-account'"
          :labelled-by="id + '-account-label'"
          v-model="model.accountId"
          resource="accounts"
          placeholder="Todas"
          clearable
          include-archived
        />
      </div>
    </template>
  </div>
</template>
