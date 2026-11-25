<script setup lang="ts">
import { resourceKeys, resourceNames } from '@max-sport/shared';
import type { ResourceKey } from '@max-sport/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { timeLabel } from '../master-data/field-types';
import { getAudit } from '../master-data/service';
import { usePagedList } from '../master-data/usePagedList';

type AuditEntry = Awaited<ReturnType<typeof getAudit>>['items'][number];
const list = usePagedList(getAudit);
const { items, total, page, limit, loading, error } = list;
const search = ref('');
const searchApplied = ref('');
const selected = ref<AuditEntry>();
const visible = ref(false);

const descriptions: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.bootstrap': 'Alta de administrador inicial',
  'auth.password.change': 'Cambio de contraseña',
  'shop.update': 'Edición de tienda',
  'currencies.update': 'Edición de moneda',
  'roles.financial.update': 'Cambio de acceso financiero',
  'rates.correct': 'Corrección de tasa',
};
const verbs: Record<string, string> = {
  create: 'Alta',
  update: 'Edición',
  archive: 'Archivo',
  restore: 'Reactivación',
};
function actionLabel(code: string) {
  const [resource = '', action = ''] = code.split('.');
  const name = resourceKeys.includes(resource as ResourceKey)
    ? resourceNames[resource as ResourceKey]
    : undefined;
  return descriptions[code] ?? (name && verbs[action] ? verbs[action] + ' de ' + name : code);
}

function load(nextPage = page.value) {
  return list.load({ q: searchApplied.value }, nextPage);
}
function submitSearch() {
  searchApplied.value = search.value.trim();
  void load(1);
}
function show(entry: AuditEntry) {
  selected.value = entry;
  visible.value = true;
}
onMounted(() => void load());
</script>

<template>
  <AppShell>
    <header class="module-heading"><h1>Auditoría</h1></header>
    <section class="records-panel" aria-label="Registro de auditoría">
      <form class="records-toolbar" @submit.prevent="submitSearch">
        <div class="records-search">
          <InputText
            v-model="search"
            maxlength="120"
            aria-label="Buscar en auditoría"
            placeholder="Buscar por acción, entidad, ID o usuario"
            fluid
          />
          <Button type="submit" label="Buscar" icon="pi pi-search" outlined severity="secondary" />
        </div>
      </form>
      <Message v-if="error" class="records-message" severity="error"
        >{{ error }}
        <button type="button" class="inline-action" @click="load()">Reintentar</button></Message
      >
      <DataTable
        :value="items"
        :loading="loading"
        :aria-busy="loading"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        :paginator="total > limit"
        :table-style="{ minWidth: '38rem' }"
        data-key="id"
        scrollable
        :pt="{
          tableContainer: { tabindex: 0, role: 'region', 'aria-label': 'Eventos de auditoría' },
        }"
        lazy
        @page="load($event.page + 1)"
      >
        <template #empty
          ><p class="records-empty" role="status">
            {{
              loading
                ? 'Cargando auditoría…'
                : error
                  ? 'Listado no disponible.'
                  : 'No hay eventos para esta búsqueda.'
            }}
          </p></template
        >
        <Column header="Fecha"
          ><template #body="{ data }">{{ timeLabel(data.createdAt) }}</template></Column
        >
        <Column header="Acción"
          ><template #body="{ data }">{{ actionLabel(data.action) }}</template></Column
        >
        <Column header="Usuario"
          ><template #body="{ data }">{{ data.user?.displayName ?? 'Sistema' }}</template></Column
        >
        <Column header="Detalle"
          ><template #body="{ data }"
            ><Button text size="small" label="Ver evento" @click="show(data)" /></template
        ></Column>
      </DataTable>
    </section>

    <Dialog
      v-model:visible="visible"
      header="Evento de auditoría"
      modal
      :draggable="false"
      class="record-dialog"
    >
      <dl v-if="selected" class="record-detail">
        <div>
          <dt>Acción</dt>
          <dd>{{ actionLabel(selected.action) }}</dd>
        </div>
        <div>
          <dt>Registro</dt>
          <dd>{{ selected.entity }} · {{ selected.entityId }}</dd>
        </div>
        <div v-if="selected.before != null">
          <dt>Antes</dt>
          <dd>
            <pre>{{ JSON.stringify(selected.before, null, 2) }}</pre>
          </dd>
        </div>
        <div v-if="selected.after != null">
          <dt>Después</dt>
          <dd>
            <pre>{{ JSON.stringify(selected.after, null, 2) }}</pre>
          </dd>
        </div>
      </dl>
    </Dialog>
  </AppShell>
</template>
