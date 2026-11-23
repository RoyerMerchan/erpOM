<script setup lang="ts">
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { FieldValue, Lookup, Option } from './field-types';
import { nestedRow, textField } from './field-types';
import { findRecord, getCurrencies, getRoles, listRecords } from './service';
import type { ResourceRow } from './service';

const props = defineProps<{
  id: string;
  resource: Lookup;
  placeholder?: string;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  clearable?: boolean;
  includeArchived?: boolean;
}>();
const model = defineModel<FieldValue>();
const matches = ref<Option[]>([]);
const selected = ref<Option>();
const loading = ref(false);
const error = ref('');
let version = 0;

const searchable = computed(() => props.resource !== 'currencies' && props.resource !== 'roles');
const options = computed(() =>
  selected.value && !matches.value.some(({ value }) => value === selected.value?.value)
    ? [selected.value, ...matches.value]
    : matches.value,
);

function option(
  row: ResourceRow,
  resource: 'brands' | 'models' | 'suppliers' | 'accounts' | 'customers',
): Option {
  const name = textField(row, 'name');
  const label =
    resource === 'models'
      ? textField(nestedRow(row, 'brand'), 'name') + ' · ' + name
      : resource === 'accounts'
        ? name + ' · ' + textField(row, 'currencyCode')
        : name;
  return { value: row.id, label: row.active ? label : label + ' (archivado)' };
}

async function load(query = '') {
  const current = ++version;
  const resource = props.resource;
  const existing = model.value;
  loading.value = true;
  error.value = '';

  try {
    let results: Option[];
    let chosen: Option | undefined;
    if (resource === 'currencies') {
      const currencies = await getCurrencies();
      results = currencies
        .filter((item) => props.includeArchived || item.active || item.code === existing)
        .map((item) => ({
          value: item.code,
          label: item.code + ' · ' + item.name + (item.active ? '' : ' (inactiva)'),
        }));
    } else if (resource === 'roles') {
      results = (await getRoles()).map(({ code, label }) => ({ value: code, label }));
    } else {
      const page = await listRecords(resource, {
        q: query,
        limit: '30',
        status: props.includeArchived ? 'all' : 'active',
      });
      results = page.items.map((row) => option(row, resource));
      if (typeof existing === 'string' && !results.some(({ value }) => value === existing)) {
        if (selected.value?.value === existing) chosen = selected.value;
        else chosen = option(await findRecord(resource, existing), resource);
      }
    }
    if (current === version) {
      matches.value = results;
      selected.value = chosen ?? results.find(({ value }) => value === existing);
    }
  } catch {
    if (current === version) error.value = 'No se pudieron cargar las opciones.';
  } finally {
    if (current === version) loading.value = false;
  }
}

function setValue(value: FieldValue) {
  selected.value = options.value.find((option) => option.value === value);
  model.value = value;
}

watch(
  () => [props.resource, props.includeArchived],
  () => void load(),
  { immediate: true },
);
watch(model, (value) => {
  if (searchable.value && value && !options.value.some((option) => option.value === value))
    void load();
});
onBeforeUnmount(() => {
  version++;
});
</script>

<template>
  <Select
    :input-id="id"
    :model-value="model"
    :options="options"
    option-label="label"
    option-value="value"
    :filter="searchable"
    :loading="loading"
    :disabled="disabled"
    :invalid="invalid"
    :show-clear="clearable"
    :aria-describedby="describedBy"
    :placeholder="placeholder ?? 'Selecciona una opción'"
    empty-message="No hay opciones disponibles."
    empty-filter-message="No se encontraron coincidencias."
    fluid
    @update:model-value="setValue"
    @filter="load($event.value)"
  />
  <Message v-if="error" severity="error" size="small" variant="simple">
    {{ error }}
    <button type="button" class="inline-action" @click="load()">Reintentar</button>
  </Message>
</template>
