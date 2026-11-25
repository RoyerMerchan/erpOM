<script setup lang="ts">
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { computed, reactive } from 'vue';
import type { PurchasePreview } from '@max-sport/shared';
import LookupSelect from '../master-data/LookupSelect.vue';
import { formatMoney } from './form';
import type { ModelGroup } from './form';

const props = defineProps<{
  index: number;
  currency: string;
  canRemove: boolean;
  rates?: PurchasePreview['lines'];
}>();
defineEmits<{ remove: [] }>();
const group = defineModel<ModelGroup>({ required: true });
const bulk = reactive({ quantity: '', cost: '', price: '' });
const modeOptions = [
  { value: 'existing', label: 'Modelo existente' },
  { value: 'new', label: 'Crear modelo' },
];
const brandOptions = [
  { value: 'existing', label: 'Marca existente' },
  { value: 'new', label: 'Crear marca' },
];
const checked = computed(() => group.value.rows.filter(({ selected }) => selected).length);
const fieldId = (key: string) => group.value.key + '-' + key;

function markAll() {
  const mark = checked.value !== 17;
  for (const row of group.value.rows) row.selected = mark;
}

function applyBulk() {
  for (const row of group.value.rows) {
    if (!row.selected) continue;
    if (bulk.quantity.trim()) row.quantity = bulk.quantity;
    if (bulk.cost.trim()) row.cost = bulk.cost;
    if (bulk.price.trim()) row.price = bulk.price;
  }
}

function estimate(size: number) {
  return props.rates?.find((line) => line.group === props.index && line.size === size);
}
</script>

<template>
  <section class="records-panel procurement-card" :aria-labelledby="fieldId('heading')">
    <header class="procurement-title-line">
      <h2 :id="fieldId('heading')">Modelo {{ index + 1 }}</h2>
      <Button
        v-if="canRemove"
        type="button"
        label="Quitar modelo"
        severity="secondary"
        text
        @click="$emit('remove')"
      />
    </header>
    <div class="record-fields procurement-fields">
      <div class="record-field">
        <label :id="fieldId('mode-label')" :for="fieldId('mode')">Origen del modelo</label>
        <Select
          v-model="group.modelMode"
          :input-id="fieldId('mode')"
          :aria-labelledby="fieldId('mode-label')"
          :options="modeOptions"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div v-if="group.modelMode === 'existing'" class="record-field">
        <label :id="fieldId('model-label')" :for="fieldId('model')">Marca y modelo</label>
        <LookupSelect
          :id="fieldId('model')"
          v-model="group.modelId"
          :labelled-by="fieldId('model-label')"
          resource="models"
        />
      </div>
      <template v-else>
        <div class="record-field">
          <label :for="fieldId('name')">Nombre del modelo</label>
          <InputText :id="fieldId('name')" v-model="group.modelName" maxlength="140" fluid />
        </div>
        <div class="record-field">
          <label :id="fieldId('brand-mode-label')" :for="fieldId('brand-mode')"
            >Origen de la marca</label
          >
          <Select
            v-model="group.brandMode"
            :input-id="fieldId('brand-mode')"
            :aria-labelledby="fieldId('brand-mode-label')"
            :options="brandOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
        <div class="record-field">
          <label :id="fieldId('brand-label')" :for="fieldId('brand')">Marca</label>
          <LookupSelect
            v-if="group.brandMode === 'existing'"
            :id="fieldId('brand')"
            v-model="group.brandId"
            :labelled-by="fieldId('brand-label')"
            resource="brands"
          />
          <InputText
            v-else
            :id="fieldId('brand')"
            v-model="group.brandName"
            maxlength="120"
            fluid
          />
        </div>
      </template>
      <div class="record-field">
        <label :for="fieldId('color')">Color (opcional)</label>
        <InputText :id="fieldId('color')" v-model="group.color" maxlength="80" fluid />
      </div>
    </div>

    <div class="matrix-bulk">
      <div class="matrix-bulk-top">
        <h3>Tallas {{ checked }} de 17</h3>
        <Button
          type="button"
          size="small"
          text
          :label="checked === 17 ? 'Desmarcar todas' : 'Marcar todas'"
          @click="markAll"
        />
      </div>
      <div class="matrix-bulk-fields">
        <InputText
          v-model="bulk.quantity"
          aria-label="Cantidad común"
          placeholder="Cantidad común"
          inputmode="numeric"
        />
        <InputText
          v-model="bulk.cost"
          aria-label="Costo unitario común"
          :placeholder="'Costo unitario ' + currency"
          inputmode="decimal"
        />
        <InputText
          v-model="bulk.price"
          aria-label="Precio común en USD"
          placeholder="Precio común USD"
          inputmode="decimal"
        />
        <Button
          type="button"
          outlined
          size="small"
          label="Aplicar a marcadas"
          :disabled="checked === 0"
          @click="applyBulk"
        />
      </div>
    </div>
    <div class="size-matrix">
      <div class="size-row size-head">
        <span>Talla</span><span>Cantidad</span><span>Costo/par {{ currency }}</span
        ><span>Precio USD</span>
      </div>
      <div
        v-for="row in group.rows"
        :key="row.size"
        class="size-row"
        :class="{ 'size-picked': row.selected }"
      >
        <div class="size-picker">
          <Checkbox v-model="row.selected" :input-id="fieldId('size-' + row.size)" binary />
          <label :for="fieldId('size-' + row.size)">{{ row.size }}</label>
        </div>
        <template v-if="row.selected">
          <InputText
            v-model="row.quantity"
            inputmode="numeric"
            :aria-label="'Cantidad talla ' + row.size"
            maxlength="6"
            fluid
          />
          <InputText
            v-model="row.cost"
            inputmode="decimal"
            :aria-label="'Costo unitario talla ' + row.size"
            maxlength="25"
            fluid
          />
          <InputText
            v-model="row.price"
            inputmode="decimal"
            :aria-label="'Precio USD talla ' + row.size"
            maxlength="19"
            fluid
          />
          <p v-if="estimate(row.size)" class="matrix-estimate">
            {{ formatMoney(estimate(row.size)?.totalOriginal, currency) }}
            <template v-if="estimate(row.size)?.totalUsd">
              · {{ formatMoney(estimate(row.size)?.totalUsd, 'USD') }} ·
              {{ formatMoney(estimate(row.size)?.unitCostUsd, 'USD/par') }}
            </template>
          </p>
        </template>
      </div>
    </div>
  </section>
</template>
