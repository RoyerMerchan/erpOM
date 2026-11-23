<script setup lang="ts">
import {
  analyticsIntervalLabels,
  analyticsLayawayLabels,
  analyticsPeriodLabels,
} from '@max-sport/shared';
import type { AnalyticsSection } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { computed, useId } from 'vue';
import LookupSelect from '../master-data/LookupSelect.vue';
import OperatorSelect from '../sales/OperatorSelect.vue';
import { useSessionStore } from '../stores/session';
import type { AnalyticsDraft } from './form';

const props = defineProps<{ section?: AnalyticsSection; busy?: boolean }>();
const model = defineModel<AnalyticsDraft>({ required: true });
const emit = defineEmits<{ apply: []; clear: [] }>();
const session = useSessionStore();
const id = useId();
const sectionIs = (...sections: AnalyticsSection[]) =>
  !props.section || sections.includes(props.section);
const product = computed(() => sectionIs('SALES', 'STOCK', 'PURCHASES', 'LAYAWAYS', 'RETURNS'));
const people = computed(() => sectionIs('SALES', 'LAYAWAYS', 'RETURNS'));
const money = computed(() => sectionIs('SALES', 'CASH', 'RETURNS'));
const rank = computed(() => sectionIs('SALES', 'CASH'));
const methods = {
  CASH: 'Efectivo',
  BANK: 'Banco',
  MOBILE: 'Pago móvil',
  CRYPTO: 'Billetera',
  OTHER: 'Otro',
};
const sizes = Array.from({ length: 17 }, (_, index) => index + 28);
const seller = computed({
  get: () => (typeof model.value.sellerId === 'string' ? model.value.sellerId : null),
  set: (value) => {
    model.value.sellerId = value;
  },
});
</script>

<template>
  <form class="sale-panel analytics-filters" @submit.prevent="emit('apply')">
    <div class="analytics-filters-line">
      <div class="field">
        <label :for="id + '-period'">Período</label>
        <select :id="id + '-period'" v-model="model.period" class="sale-native-select">
          <option v-for="(label, value) in analyticsPeriodLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
      <template v-if="model.period === 'RANGE'">
        <div class="field">
          <label :for="id + '-from'">Desde</label>
          <InputText :id="id + '-from'" v-model="model.from" type="date" required fluid />
        </div>
        <div class="field">
          <label :for="id + '-to'">Hasta</label>
          <InputText
            :id="id + '-to'"
            v-model="model.to"
            type="date"
            :min="model.from || undefined"
            required
            fluid
          />
        </div>
      </template>
      <div v-if="rank" class="field">
        <label :for="id + '-interval'">Gráfico por</label>
        <select :id="id + '-interval'" v-model="model.interval" class="sale-native-select">
          <option v-for="(label, value) in analyticsIntervalLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
      <div class="sale-actions analytics-filter-action">
        <Button type="submit" label="Aplicar" icon="pi pi-filter" :loading="busy" />
        <Button
          type="button"
          label="Limpiar"
          variant="text"
          severity="secondary"
          @click="emit('clear')"
        />
      </div>
    </div>
    <details class="analytics-extra">
      <summary>Filtros de datos</summary>
      <div class="finance-fields">
        <div v-if="people && session.can('sales.read.all')" class="field">
          <label :for="id + '-seller'">Vendedor</label>
          <OperatorSelect :id="id + '-seller'" v-model="seller" placeholder="Todos" />
        </div>
        <div v-if="people && session.can('customers.read')" class="field">
          <label :for="id + '-customer'">Cliente</label>
          <LookupSelect
            :id="id + '-customer'"
            v-model="model.customerId"
            resource="customers"
            include-archived
            clearable
            placeholder="Todos"
          />
        </div>
        <template v-if="product">
          <div v-if="session.can('brands.read')" class="field">
            <label :for="id + '-brand'">Marca</label>
            <LookupSelect
              :id="id + '-brand'"
              v-model="model.brandId"
              resource="brands"
              include-archived
              clearable
              placeholder="Todas"
            />
          </div>
          <div v-if="session.can('models.read')" class="field">
            <label :for="id + '-model'">Modelo</label>
            <LookupSelect
              :id="id + '-model'"
              v-model="model.modelId"
              resource="models"
              include-archived
              clearable
              placeholder="Todos"
            />
          </div>
          <div class="field">
            <label :for="id + '-size'">Talla</label>
            <select :id="id + '-size'" v-model="model.size" class="sale-native-select">
              <option :value="null">Todas</option>
              <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
            </select>
          </div>
        </template>
        <div v-if="sectionIs('PURCHASES') && session.can('suppliers.read')" class="field">
          <label :for="id + '-supplier'">Proveedor</label>
          <LookupSelect
            :id="id + '-supplier'"
            v-model="model.supplierId"
            resource="suppliers"
            include-archived
            clearable
            placeholder="Todos"
          />
        </div>
        <template v-if="money">
          <div v-if="session.can('accounts.read')" class="field">
            <label :for="id + '-account'">Cuenta</label>
            <LookupSelect
              :id="id + '-account'"
              v-model="model.accountId"
              resource="accounts"
              include-archived
              clearable
              placeholder="Todas"
            />
          </div>
          <div v-if="session.can('currencies.read')" class="field">
            <label :for="id + '-currency'">Moneda</label>
            <LookupSelect
              :id="id + '-currency'"
              v-model="model.currencyCode"
              resource="currencies"
              include-archived
              clearable
              placeholder="Todas"
            />
          </div>
          <div class="field">
            <label :for="id + '-method'">Método de cobro</label>
            <select :id="id + '-method'" v-model="model.method" class="sale-native-select">
              <option :value="null">Todos</option>
              <option v-for="(label, value) in methods" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
        </template>
        <div v-if="sectionIs('LAYAWAYS') && session.can('layaways.read')" class="field">
          <label :for="id + '-status'">Estado de apartado</label>
          <select :id="id + '-status'" v-model="model.layawayState" class="sale-native-select">
            <option :value="null">Todos</option>
            <option v-for="(label, value) in analyticsLayawayLabels" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
        </div>
      </div>
    </details>
  </form>
</template>
