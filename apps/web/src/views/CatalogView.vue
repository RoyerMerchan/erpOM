<script setup lang="ts">
import { currencyCodeSchema, resourcePermission } from '@max-sport/shared';
import type { ResourceKey } from '@max-sport/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import FinanceAccountBalances from '../finance/FinanceAccountBalances.vue';
import { formPayload, textField, timeLabel } from '../master-data/field-types';
import type { FormValues } from '../master-data/field-types';
import RecordFields from '../master-data/RecordFields.vue';
import { catalogs, editorFields, initialForm } from '../master-data/resources';
import { listRecords, recordStatus, saveRecord } from '../master-data/service';
import type { ResourceRow } from '../master-data/service';
import { usePagedList } from '../master-data/usePagedList';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ resource: ResourceKey }>();
const session = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const catalog = computed(() => catalogs[props.resource]);
const list = usePagedList((filters) => listRecords(props.resource, filters));
const { items, total, page, limit, loading, error } = list;
const search = ref('');
const searchApplied = ref('');
const status = ref('all');
const currency = ref('');
const balancesRevision = ref(0);
const currencies = [
  { value: '', label: 'Todas las monedas' },
  ...currencyCodeSchema.options.map((code) => ({ value: code, label: code })),
];
const statuses = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'active', label: props.resource === 'rates' ? 'Disponibles' : 'Activos' },
  { value: 'archived', label: 'Archivados' },
];

const editing = ref<ResourceRow | null>(null);
const detail = ref<ResourceRow | null>(null);
const editorVisible = ref(false);
const detailVisible = ref(false);
const draft = ref<FormValues>({});
const fields = computed(() => editorFields(props.resource, editing.value, session.user?.id));
const formErrors = ref<Record<string, string>>({});
const saveError = ref('');
const saving = ref(false);
const changingStatus = ref<string>();
const moneyFilter = computed(() => ['rates', 'accounts'].includes(props.resource));
const mayCreate = computed(() => session.can(resourcePermission(props.resource, 'create')));
const mayUpdate = computed(() => session.can(resourcePermission(props.resource, 'update')));
const mayArchive = computed(() => session.can(resourcePermission(props.resource, 'archive')));
const title = computed(() =>
  editing.value
    ? props.resource === 'rates'
      ? 'Corregir tasa'
      : 'Editar registro'
    : catalog.value.createLabel,
);

function load(nextPage = page.value) {
  return list.load(
    {
      q: searchApplied.value,
      status: status.value,
      ...(currency.value ? { currencyCode: currency.value } : {}),
    },
    nextPage,
  );
}

function submitSearch() {
  searchApplied.value = search.value.trim();
  void load(1);
}

function openEditor(row: ResourceRow | null) {
  editing.value = row;
  draft.value = initialForm(fields.value, row);
  formErrors.value = {};
  saveError.value = '';
  editorVisible.value = true;
}

function openDetail(row: ResourceRow) {
  detail.value = row;
  detailVisible.value = true;
}

function allowUpdate(row: ResourceRow) {
  return mayUpdate.value && (props.resource !== 'rates' || row.active);
}

function allowStatus(row: ResourceRow) {
  return (
    mayArchive.value &&
    !(props.resource === 'rates' && !row.active) &&
    !(props.resource === 'users' && row.id === session.user?.id)
  );
}

async function submit() {
  if (saving.value) return;
  formErrors.value = {};
  saveError.value = '';
  const schema = editing.value
    ? (catalog.value.editSchema ?? catalog.value.schema)
    : catalog.value.schema;
  const parsed = schema.safeParse(formPayload(fields.value, draft.value));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string') formErrors.value[key] ??= issue.message;
    }
    return;
  }

  saving.value = true;
  try {
    await saveRecord(props.resource, editing.value?.id ?? null, parsed.data);
    if (props.resource === 'accounts') balancesRevision.value++;
    editorVisible.value = false;
    toast.add({ severity: 'success', summary: 'Registro guardado', life: 3500 });
    await load(editing.value ? page.value : 1);
  } catch (failure) {
    saveError.value = failure instanceof ApiRequestError ? failure.message : 'No se pudo guardar.';
  } finally {
    saving.value = false;
  }
}

async function changeStatus(row: ResourceRow) {
  changingStatus.value = row.id;
  try {
    await recordStatus(props.resource, row.id, !row.active);
    if (props.resource === 'accounts') balancesRevision.value++;
    toast.add({
      severity: 'success',
      summary: row.active ? 'Registro archivado' : 'Registro reactivado',
      life: 3500,
    });
    await load();
  } catch (failure) {
    toast.add({
      severity: 'error',
      summary:
        failure instanceof ApiRequestError ? failure.message : 'No se pudo cambiar el estado.',
      life: 6000,
    });
  } finally {
    changingStatus.value = undefined;
  }
}

function confirmStatus(row: ResourceRow) {
  const action = row.active ? 'Archivar' : 'Reactivar';
  confirm.require({
    header: action + ' registro',
    message: row.active
      ? 'El registro seguirá disponible en el historial.'
      : 'El registro volverá a aparecer entre los activos.',
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: action, severity: row.active ? 'danger' : 'primary' },
    rejectProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
    accept: () => void changeStatus(row),
  });
}

onMounted(() => void load());
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <div>
        <h1>{{ catalog.title }}</h1>
        <p v-if="resource === 'rates'">1 USD = X unidades de la moneda seleccionada.</p>
      </div>
      <Button
        v-if="mayCreate"
        :label="catalog.createLabel"
        icon="pi pi-plus"
        @click="openEditor(null)"
      />
    </header>

    <FinanceAccountBalances
      v-if="resource === 'accounts' && session.can('finance.read')"
      :key="balancesRevision"
    />

    <section class="records-panel" :aria-label="catalog.title">
      <form class="records-toolbar" @submit.prevent="submitSearch">
        <div class="records-search">
          <InputText
            v-model="search"
            :aria-label="catalog.searchLabel"
            :placeholder="catalog.searchLabel"
            maxlength="120"
            fluid
          />
          <Button label="Buscar" type="submit" icon="pi pi-search" severity="secondary" outlined />
        </div>
        <Select
          v-model="status"
          :options="statuses"
          option-label="label"
          option-value="value"
          aria-label="Filtrar por estado"
          @update:model-value="load(1)"
        />
        <Select
          v-if="moneyFilter"
          v-model="currency"
          :options="currencies"
          option-label="label"
          option-value="value"
          aria-label="Filtrar por moneda"
          @update:model-value="load(1)"
        />
      </form>

      <Message v-if="error" class="records-message" severity="error">
        {{ error }}
        <button type="button" class="inline-action" @click="load()">Reintentar</button>
      </Message>
      <DataTable
        :value="items"
        :loading="loading"
        :aria-busy="loading"
        :total-records="total"
        :rows="limit"
        :first="(page - 1) * limit"
        :paginator="total > limit"
        :table-style="{ minWidth: catalog.columns.length > 4 ? '47rem' : '35rem' }"
        data-key="id"
        scrollable
        :pt="{
          tableContainer: {
            tabindex: 0,
            role: 'region',
            'aria-label': `Registros de ${catalog.title.toLowerCase()}`,
          },
        }"
        lazy
        @page="load($event.page + 1)"
      >
        <template #empty>
          <p class="records-empty" role="status">
            {{
              loading
                ? 'Cargando registros…'
                : error
                  ? 'Listado no disponible.'
                  : 'No hay registros para estos filtros.'
            }}
          </p>
        </template>
        <Column v-for="column in catalog.columns" :key="column.label" :header="column.label">
          <template #body="{ data }"
            ><span class="record-cell">{{ column.value(data) }}</span></template
          >
        </Column>
        <Column header="Estado">
          <template #body="{ data }">
            <Tag
              :severity="data.active ? 'success' : 'secondary'"
              :value="data.active ? (resource === 'rates' ? 'Disponible' : 'Activo') : 'Archivado'"
            />
          </template>
        </Column>
        <Column header="Acciones">
          <template #body="{ data }">
            <div class="record-actions">
              <Button text size="small" label="Ver" @click="openDetail(data)" />
              <Button
                v-if="allowUpdate(data)"
                text
                size="small"
                :label="resource === 'rates' ? 'Corregir' : 'Editar'"
                @click="openEditor(data)"
              />
              <Button
                v-if="allowStatus(data)"
                text
                size="small"
                severity="secondary"
                :label="data.active ? 'Archivar' : 'Reactivar'"
                :loading="changingStatus === data.id"
                :disabled="Boolean(changingStatus)"
                @click="confirmStatus(data)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog
      v-model:visible="editorVisible"
      :header="title"
      modal
      :draggable="false"
      :closable="!saving"
      :close-on-escape="!saving"
      class="record-dialog"
      @hide="draft = {}"
    >
      <p v-if="resource === 'rates' && editing" class="revision-note">
        {{ textField(editing, 'currencyCode') }}. Al guardar, se creará una versión nueva y se
        archivará la anterior.
      </p>
      <form novalidate class="record-form" @submit.prevent="submit">
        <RecordFields
          v-model="draft"
          :fields="fields"
          :errors="formErrors"
          :disabled="saving"
          prefix="edit-record"
        />
        <Message v-if="saveError" severity="error">{{ saveError }}</Message>
        <div class="record-form-actions">
          <Button
            label="Cancelar"
            severity="secondary"
            outlined
            :disabled="saving"
            @click="editorVisible = false"
          />
          <Button label="Guardar" type="submit" :loading="saving" :disabled="saving" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="detailVisible"
      header="Detalle del registro"
      modal
      :draggable="false"
      class="record-dialog"
    >
      <dl v-if="detail" class="record-detail">
        <div v-for="column in catalog.columns" :key="column.label">
          <dt>{{ column.label }}</dt>
          <dd>{{ column.value(detail) || '—' }}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{{ detail.active ? 'Activo' : 'Archivado' }}</dd>
        </div>
        <div v-if="resource === 'customers' || resource === 'suppliers'">
          <dt>Dirección</dt>
          <dd>{{ textField(detail, 'address') || '—' }}</dd>
        </div>
        <div v-if="resource === 'customers' || resource === 'suppliers'">
          <dt>Notas</dt>
          <dd>{{ textField(detail, 'notes') || '—' }}</dd>
        </div>
        <div v-if="resource === 'variants'">
          <dt>Umbral de stock bajo</dt>
          <dd>{{ detail.lowStockThreshold ?? 'Valor de la tienda' }}</dd>
        </div>
        <div v-if="resource === 'rates' && detail.replacesId">
          <dt>Versión anterior</dt>
          <dd>{{ detail.replacesId }}</dd>
        </div>
        <div v-if="resource === 'rates' && detail.archivedAt">
          <dt>Archivada</dt>
          <dd>{{ timeLabel(textField(detail, 'archivedAt')) }}</dd>
        </div>
      </dl>
    </Dialog>
  </AppShell>
</template>
