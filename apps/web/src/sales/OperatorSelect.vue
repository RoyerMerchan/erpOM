<script setup lang="ts">
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { failureMessage } from '../purchasing/form';
import { getSaleOperators } from './service';

defineProps<{ id: string; placeholder: string }>();
const model = defineModel<string | null>({ required: true });
type Operator = Awaited<ReturnType<typeof getSaleOperators>>['items'][number];
const matches = ref<Operator[]>([]);
const selected = ref<Operator>();
const loading = ref(false);
const error = ref('');
let version = 0;
const options = computed(() => {
  const saved = selected.value;
  return saved && !matches.value.some(({ id }) => id === saved.id)
    ? [saved, ...matches.value]
    : matches.value;
});

async function load(q = '') {
  const current = ++version;
  loading.value = true;
  error.value = '';
  try {
    const result = await getSaleOperators(q);
    if (current === version) matches.value = result.items;
  } catch (failure) {
    if (current === version)
      error.value = failureMessage(failure, 'No se pudieron cargar los vendedores.');
  } finally {
    if (current === version) loading.value = false;
  }
}

function select(id: string | null) {
  selected.value = options.value.find((entry) => entry.id === id);
  model.value = id;
}
onMounted(() => void load());
onBeforeUnmount(() => {
  version++;
});
</script>

<template>
  <Select
    :input-id="id"
    :placeholder="placeholder"
    :model-value="model"
    :options="options"
    :loading="loading"
    option-value="id"
    option-label="displayName"
    empty-message="No hay vendedores disponibles."
    empty-filter-message="No se encontraron vendedores."
    filter
    show-clear
    fluid
    @update:model-value="select"
    @filter="load($event.value)"
  />
  <Message v-if="error" severity="error" size="small" variant="simple">
    {{ error }} <button type="button" class="inline-action" @click="load()">Reintentar</button>
  </Message>
</template>
