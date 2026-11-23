<script setup lang="ts">
import { financeCategoryInput } from '@max-sport/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Paginator from 'primevue/paginator';
import { ref, watch } from 'vue';
import { usePagedList } from '../master-data/usePagedList';
import { failureMessage } from '../purchasing/form';
import { getFinanceCategories, saveFinanceCategory } from './service';

const open = defineModel<boolean>({ required: true });
type Category = Awaited<ReturnType<typeof getFinanceCategories>>['items'][number];
const { items, page, total, limit, loading, error, load } = usePagedList(getFinanceCategories);
limit.value = 12;
const q = ref('');
const applied = ref('');
const formOpen = ref(false);
const editing = ref<string | null>(null);
const name = ref('');
const active = ref(true);
const saving = ref(false);
const saveError = ref('');

const loadPage = (next = 1) => load({ status: 'all', q: applied.value }, next);
function search() {
  applied.value = q.value;
  void loadPage();
}
function edit(record?: Category) {
  editing.value = record?.id ?? null;
  name.value = record?.name ?? '';
  active.value = record?.active ?? true;
  formOpen.value = true;
  saveError.value = '';
}
async function save() {
  if (saving.value) return;
  const input = financeCategoryInput.safeParse({ name: name.value, active: active.value });
  if (!input.success) {
    saveError.value = input.error.issues[0]?.message ?? 'Revisa la categoría.';
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    await saveFinanceCategory(editing.value, input.data);
    formOpen.value = false;
    await loadPage(page.value);
  } catch (failure) {
    saveError.value = failureMessage(failure, 'No se pudo guardar la categoría.');
  } finally {
    saving.value = false;
  }
}
watch(open, (visible) => {
  if (visible) void loadPage();
  else formOpen.value = false;
});
</script>

<template>
  <Dialog
    v-model:visible="open"
    header="Categorías de gasto"
    modal
    :style="{ width: 'min(92vw, 36rem)' }"
  >
    <div class="finance-stack">
      <form class="activity-search" role="search" @submit.prevent="search">
        <div class="field">
          <label for="category-q">Buscar por nombre</label>
          <InputText id="category-q" v-model="q" maxlength="120" fluid />
        </div>
        <Button
          type="submit"
          label="Buscar"
          icon="pi pi-search"
          variant="outlined"
          :loading="loading"
        />
      </form>
      <Message v-if="error" severity="error">{{ error }}</Message>
      <Button
        type="button"
        label="Crear categoría"
        icon="pi pi-plus"
        variant="outlined"
        size="small"
        class="activity-fit"
        @click="edit()"
      />
      <form v-if="formOpen" class="finance-stack" @submit.prevent="save">
        <div class="field">
          <label for="category-name">Nombre de la categoría</label>
          <InputText id="category-name" v-model="name" maxlength="100" required fluid />
        </div>
        <label for="category-active" class="activity-check">
          <Checkbox input-id="category-active" v-model="active" binary /> Disponible para nuevos
          gastos
        </label>
        <Message v-if="saveError" severity="error">{{ saveError }}</Message>
        <div class="sale-actions">
          <Button
            type="button"
            label="Volver"
            variant="outlined"
            severity="secondary"
            :disabled="saving"
            @click="formOpen = false"
          />
          <Button type="submit" label="Guardar categoría" :loading="saving" />
        </div>
      </form>
      <p v-if="!loading && !error && !items.length" class="sale-muted">
        No hay categorías para esta búsqueda.
      </p>
      <ul v-else class="sale-detail-list">
        <li v-for="category in items" :key="category.id">
          <span>{{ category.name }}<template v-if="!category.active"> · Archivada</template></span>
          <Button
            type="button"
            label="Editar"
            size="small"
            variant="text"
            :aria-label="'Editar ' + category.name"
            @click="edit(category)"
          />
        </li>
      </ul>
      <Paginator
        v-if="total > limit"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        template="PrevPageLink CurrentPageReport NextPageLink"
        @page="loadPage($event.page + 1)"
      />
    </div>
  </Dialog>
</template>
