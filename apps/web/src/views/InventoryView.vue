<script setup lang="ts">
import { inventoryAdjustment, inventoryQuerySchema } from '@max-sport/shared';
import type { InventoryRow } from '@max-sport/shared';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { timeLabel } from '../master-data/field-types';
import type { FieldValue } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { usePagedList } from '../master-data/usePagedList';
import { decimalText, failureMessage, formatMoney, operationKey } from '../purchasing/form';
import { getInventory, getStockMovements, postAdjustment } from '../purchasing/service';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const toast = useToast();
const params = inventoryQuerySchema.safeParse(useRoute().query);
const initial = params.success ? params.data : undefined;
const query = reactive({
  search: initial?.q ?? '',
  applied: initial?.q ?? '',
  stock: initial?.stock ?? 'ALL',
  size: initial?.size ?? 0,
  brandId: (initial?.brandId ?? null) as FieldValue,
  modelId: (initial?.modelId ?? null) as FieldValue,
});
const stockOptions = [
  { value: 'ALL', label: 'Todas las existencias' },
  { value: 'AVAILABLE', label: 'Con stock' },
  { value: 'LOW', label: 'Stock bajo' },
  { value: 'OUT', label: 'Agotadas' },
];
const sizes = [
  { value: 0, label: 'Todas las tallas' },
  ...Array.from({ length: 17 }, (_, index) => ({ value: index + 28, label: String(index + 28) })),
];
const movementsLabel = {
  RECEIPT: 'Recepción',
  RECEIPT_REVERSAL: 'Anulación de recepción',
  ADJUST_IN: 'Ajuste de entrada',
  ADJUST_OUT: 'Ajuste de salida',
  SALE_OUT: 'Venta',
  RESERVE: 'Reserva de apartado',
  RELEASE_RESERVATION: 'Liberación de apartado',
  SALE_RETURN_IN: 'Reingreso por devolución',
};

const list = usePagedList(getInventory);
const { items, page, limit, loading, total, error } = list;
const selected = ref<InventoryRow>();
const open = ref<'adjustment' | 'history'>();
const history = usePagedList((query) => {
  if (!selected.value) return Promise.resolve({ items: [], total: 0 });
  return getStockMovements(selected.value.id, query);
});
const {
  items: entries,
  loading: historyLoading,
  error: historyError,
  page: historyPage,
  total: historyTotal,
  limit: historyLimit,
} = history;
const draft = reactive({ direction: 'out', quantity: '1', cost: '', reason: '' });
const issue = ref('');
const processing = ref(false);
let key = operationKey();
const directionOptions = computed(() => [
  { value: 'out', label: 'Salida' },
  ...(session.can('costs.read') ? [{ value: 'in', label: 'Entrada' }] : []),
]);

function load(nextPage = page.value) {
  return list.load(
    {
      q: query.applied,
      stock: query.stock,
      ...(query.size ? { size: String(query.size) } : {}),
      ...(query.brandId ? { brandId: String(query.brandId) } : {}),
      ...(query.modelId ? { modelId: String(query.modelId) } : {}),
    },
    nextPage,
  );
}
function submitSearch() {
  query.applied = query.search;
  void load(1);
}
function showHistory(row: InventoryRow) {
  selected.value = row;
  open.value = 'history';
  void history.load({}, 1);
}
function showAdjust(row: InventoryRow) {
  key = operationKey();
  selected.value = row;
  Object.assign(draft, { direction: 'out', quantity: '1', cost: '', reason: '' });
  issue.value = '';
  open.value = 'adjustment';
}
async function apply() {
  if (!selected.value || processing.value) return;
  const id = selected.value.id;
  issue.value = '';
  const quantity = Number(draft.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    issue.value = 'La cantidad debe ser un número entero positivo.';
    return;
  }
  const body = {
    quantityDelta: draft.direction === 'in' ? quantity : -quantity,
    reason: draft.reason,
    unitCostUsd: draft.direction === 'in' ? decimalText(draft.cost) : null,
  };
  const result = inventoryAdjustment.safeParse({ ...body, operationId: key({ id, body }) });
  if (!result.success) {
    issue.value = result.error.issues[0]?.message ?? 'Revisa el ajuste.';
    return;
  }
  processing.value = true;
  try {
    await postAdjustment(id, result.data);
    open.value = undefined;
    toast.add({ severity: 'success', summary: 'Ajuste registrado', life: 3200 });
    await load();
  } catch (failure) {
    issue.value = failureMessage(failure, 'No se pudo registrar el ajuste.');
  } finally {
    processing.value = false;
  }
}
onMounted(() => void load());
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading"><h1>Existencias</h1></header>
    <section class="records-panel" aria-label="Inventario por variante">
      <form class="records-toolbar" @submit.prevent="submitSearch">
        <div class="records-search">
          <InputText
            v-model="query.search"
            placeholder="Buscar por SKU, marca o modelo"
            aria-label="Buscar por SKU, marca o modelo"
            maxlength="120"
            fluid
          /><Button type="submit" label="Buscar" severity="secondary" outlined />
        </div>
        <Select
          v-model="query.stock"
          :options="stockOptions"
          option-label="label"
          option-value="value"
          aria-label="Filtrar por stock"
          @update:model-value="load(1)"
        />
        <Select
          v-model="query.size"
          :options="sizes"
          option-label="label"
          option-value="value"
          aria-label="Filtrar por talla"
          @update:model-value="load(1)"
        />
      </form>
      <div
        v-if="session.can('brands.read') || session.can('models.read')"
        class="inventory-filters"
      >
        <div v-if="session.can('brands.read')" class="record-field">
          <label for="inventory-brand">Marca</label>
          <LookupSelect
            id="inventory-brand"
            v-model="query.brandId"
            resource="brands"
            clearable
            @update:model-value="load(1)"
          />
        </div>
        <div v-if="session.can('models.read')" class="record-field">
          <label for="inventory-model">Modelo</label>
          <LookupSelect
            id="inventory-model"
            v-model="query.modelId"
            resource="models"
            clearable
            @update:model-value="load(1)"
          />
        </div>
      </div>
      <Message v-if="error" severity="error" class="records-message"
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
        :table-style="{ minWidth: session.can('costs.read') ? '75rem' : '61rem' }"
        data-key="id"
        lazy
        scrollable
        :pt="{
          tableContainer: { tabindex: 0, role: 'region', 'aria-label': 'Existencias por variante' },
        }"
        @page="load($event.page + 1)"
      >
        <template #empty
          ><p class="records-empty" role="status">
            {{
              loading
                ? 'Cargando existencias…'
                : error
                  ? 'Inventario no disponible.'
                  : 'No hay variantes para estos filtros.'
            }}
          </p></template
        >
        <Column header="Producto"
          ><template #body="{ data }"
            ><strong>{{ data.brandName }} · {{ data.modelName }}</strong
            ><small class="inventory-sku"
              >{{ data.sku }}<template v-if="data.color"> · {{ data.color }}</template></small
            ></template
          ></Column
        >
        <Column field="size" header="Talla" /><Column field="physical" header="Físico" /><Column
          field="reserved"
          header="Reservado"
        />
        <Column header="Disponible"
          ><template #body="{ data }"
            ><strong>{{ data.available }}</strong></template
          ></Column
        >
        <Column header="Alerta"
          ><template #body="{ data }">
            <Tag
              v-if="!data.active || data.lowStock"
              :severity="data.active ? 'warn' : 'secondary'"
              :value="data.active ? (data.available === 0 ? 'Agotada' : 'Stock bajo') : 'Archivada'"
            />
            <small class="inventory-sku">Umbral {{ data.threshold }}</small>
          </template></Column
        >
        <Column header="Precio USD"
          ><template #body="{ data }">{{ formatMoney(data.salePriceUsd, 'USD') }}</template></Column
        >
        <Column v-if="session.can('costs.read')" header="Costo FIFO USD"
          ><template #body="{ data }">{{ formatMoney(data.unitCostUsd, 'USD') }}</template></Column
        >
        <Column
          v-if="session.can('costs.read') && session.can('profits.read')"
          header="Margen estimado"
          ><template #body="{ data }">{{ formatMoney(data.marginUsd, 'USD') }}</template></Column
        >
        <Column header="Última recepción"
          ><template #body="{ data }">{{
            data.lastPurchaseAt ? timeLabel(data.lastPurchaseAt) : '—'
          }}</template></Column
        >
        <Column header="Acciones"
          ><template #body="{ data }">
            <div class="record-actions">
              <Button label="Movimientos" text size="small" @click="showHistory(data)" />
              <Button
                v-if="session.can('inventory.adjust')"
                label="Ajustar"
                text
                size="small"
                severity="secondary"
                @click="showAdjust(data)"
              />
            </div> </template
        ></Column>
      </DataTable>
    </section>
    <Dialog
      :visible="open === 'history'"
      header="Movimientos de stock"
      modal
      :draggable="false"
      class="record-dialog"
      @update:visible="if (!$event) open = undefined;"
    >
      <p v-if="selected" class="record-hint">
        {{ selected.modelName }} · Talla {{ selected.size }}
      </p>
      <p v-if="historyLoading" class="records-empty" role="status">Cargando movimientos…</p>
      <Message v-else-if="historyError" severity="error"
        >{{ historyError }}
        <button class="inline-action" type="button" @click="history.load({})">
          Reintentar
        </button></Message
      >
      <p v-else-if="!entries.length" class="records-empty">Aún no hay movimientos.</p>
      <ul v-else class="stock-history">
        <li v-for="entry in entries" :key="entry.id">
          <strong>
            {{ movementsLabel[entry.kind] }} ·
            <template v-if="entry.reservedDelta"
              >{{ entry.reservedDelta > 0 ? '+' : '' }}{{ entry.reservedDelta }} en
              reserva</template
            >
            <template v-else
              >{{ entry.quantityDelta > 0 ? '+' : '' }}{{ entry.quantityDelta }}</template
            >
          </strong>
          <small>{{ timeLabel(entry.occurredAt) }} · {{ entry.actorName }}</small>
          <p v-if="entry.reason">{{ entry.reason }}</p>
          <RouterLink
            v-if="entry.purchaseId"
            :to="{ name: 'purchase-detail', params: { id: entry.purchaseId } }"
            class="inline-action"
            >Ver compra</RouterLink
          >
        </li>
      </ul>
      <div v-if="historyTotal > historyLimit" class="procurement-actions">
        <Button
          type="button"
          label="Anterior"
          outlined
          :disabled="historyPage <= 1 || historyLoading"
          @click="history.load({}, historyPage - 1)"
        />
        <Button
          type="button"
          label="Siguiente"
          outlined
          :disabled="historyPage * historyLimit >= historyTotal || historyLoading"
          @click="history.load({}, historyPage + 1)"
        />
      </div>
    </Dialog>
    <Dialog
      :visible="open === 'adjustment'"
      header="Ajustar existencias"
      modal
      :draggable="false"
      :closable="!processing"
      :close-on-escape="!processing"
      class="record-dialog"
      @update:visible="if (!$event) open = undefined;"
    >
      <form novalidate class="record-form" @submit.prevent="apply">
        <p v-if="selected">
          {{ selected.modelName }} · Talla {{ selected.size }} ·
          {{ selected.available }} disponibles
        </p>
        <div class="record-fields">
          <div class="record-field">
            <label for="stock-adjustment-type">Movimiento</label>
            <Select
              v-model="draft.direction"
              input-id="stock-adjustment-type"
              :options="directionOptions"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <div class="record-field">
            <label for="stock-adjustment-qty">Cantidad</label
            ><InputText
              id="stock-adjustment-qty"
              v-model="draft.quantity"
              inputmode="numeric"
              maxlength="6"
              fluid
            />
          </div>
          <div v-if="draft.direction === 'in'" class="record-field">
            <label for="stock-adjustment-cost">Costo por par (USD)</label
            ><InputText
              id="stock-adjustment-cost"
              v-model="draft.cost"
              inputmode="decimal"
              maxlength="19"
              fluid
            />
          </div>
          <div class="record-field record-field-wide">
            <label for="stock-adjustment-reason">Motivo</label>
            <Textarea
              id="stock-adjustment-reason"
              v-model="draft.reason"
              maxlength="500"
              rows="3"
              fluid
            />
          </div>
        </div>
        <Message v-if="issue" severity="error">{{ issue }}</Message>
        <div class="record-form-actions">
          <Button
            type="button"
            label="Cancelar"
            severity="secondary"
            outlined
            :disabled="processing"
            @click="open = undefined"
          />
          <Button
            type="submit"
            label="Registrar ajuste"
            :loading="processing"
            :disabled="processing"
          />
        </div>
      </form>
    </Dialog>
  </AppShell>
</template>
