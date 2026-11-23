<script setup lang="ts">
import Message from 'primevue/message';
import Select from 'primevue/select';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getFinanceCategories } from './service';

const props = defineProps<{ id: string; includeArchived?: boolean; clearable?: boolean }>();
const model = defineModel<string | null>({ required: true });
type Category = Awaited<ReturnType<typeof getFinanceCategories>>['items'][number];
const matches = ref<Category[]>([]);
const chosen = ref<Category>();
const loading = ref(false);
const error = ref('');
let version = 0;
const options = computed(() => {
  const selected = chosen.value;
  const records =
    selected && !matches.value.some(({ id }) => id === selected.id)
      ? [selected, ...matches.value]
      : matches.value;
  return records.map((record) => ({
    ...record,
    label: record.active ? record.name : record.name + ' (archivada)',
  }));
});

async function load(q = '') {
  const key = ++version;
  loading.value = true;
  error.value = '';
  try {
    const response = await getFinanceCategories({
      q,
      limit: '40',
      status: props.includeArchived ? 'all' : 'active',
    });
    if (key === version) matches.value = response.items;
  } catch {
    if (key === version) error.value = 'No se pudieron cargar las categorías.';
  } finally {
    if (key === version) loading.value = false;
  }
}

function select(id: string | null) {
  chosen.value = options.value.find((record) => record.id === id);
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
    :model-value="model"
    :options="options"
    option-label="label"
    option-value="id"
    :loading="loading"
    :show-clear="clearable"
    :placeholder="clearable ? 'Todas' : 'Selecciona una categoría'"
    empty-message="No hay categorías disponibles."
    empty-filter-message="No hay coincidencias."
    filter
    fluid
    @update:model-value="select"
    @filter="load($event.value)"
  />
  <Message v-if="error" severity="error" size="small" variant="simple">
    {{ error }} <button type="button" class="inline-action" @click="load()">Reintentar</button>
  </Message>
</template>
