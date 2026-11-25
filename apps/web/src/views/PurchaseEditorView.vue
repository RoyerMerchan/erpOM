<script setup lang="ts">
import { contactInput, purchaseInput } from '@max-sport/shared';
import type { PurchaseInput, PurchasePreview } from '@max-sport/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { browserTimeZone, localDateInput } from '../master-data/field-types';
import type { Field, FieldValue, FormValues } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import RecordFields from '../master-data/RecordFields.vue';
import { saveRecord } from '../master-data/service';
import {
  asDate,
  createGroup,
  decimalText,
  failureMessage,
  modelGroupPayload,
} from '../purchasing/form';
import PurchaseTotals from '../purchasing/PurchaseTotals.vue';
import {
  createDraft,
  getPurchase,
  getQuote,
  previewDraft,
  updateDraft,
} from '../purchasing/service';
import SizeMatrix from '../purchasing/SizeMatrix.vue';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ id?: string; fromInventory?: boolean }>();
const router = useRouter();
const session = useSessionStore();
const toast = useToast();
const draft = reactive({
  supplierId: null as FieldValue,
  documentAt: localDateInput(new Date()),
  reference: '',
  notes: '',
  currencyCode: 'USD' as FieldValue,
  rate: '',
  freight: '',
  groups: [createGroup()],
});
const revision = ref(0);
const preview = ref<PurchasePreview>();
const error = ref('');
const loadError = ref('');
const loading = ref(Boolean(props.id));
const active = ref<'preview' | 'save' | 'quote'>();
const currency = computed(() => (typeof draft.currencyCode === 'string' ? draft.currencyCode : ''));
const supplierOpen = ref(false);
const supplierSaving = ref(false);
const supplierError = ref('');
const supplierDraft = ref<FormValues>({});
const contactFields: Field[] = [
  { key: 'name', label: 'Nombre', required: true, max: 160 },
  { key: 'document', label: 'Documento', max: 60 },
  { key: 'phone', label: 'Teléfono', max: 60 },
  { key: 'email', label: 'Correo electrónico', max: 254 },
];

const payload = computed(() => ({
  supplierId: draft.supplierId,
  documentAt: asDate(draft.documentAt),
  reference: draft.reference,
  notes: draft.notes,
  currencyCode: draft.currencyCode,
  unitsPerUsd: currency.value === 'USD' ? null : decimalText(draft.rate) || null,
  freightOriginal: decimalText(draft.freight) || '0',
  groups: draft.groups.map(modelGroupPayload),
}));
watch(payload, () => {
  preview.value = undefined;
});

async function load() {
  if (!props.id) return;
  loading.value = true;
  loadError.value = '';
  try {
    const current = await getPurchase(props.id);
    const data = current.draft;
    if (!data) {
      loadError.value = 'La compra está cerrada. Abre el detalle para verla.';
      return;
    }
    Object.assign(draft, {
      supplierId: data.supplierId,
      documentAt: localDateInput(data.documentAt),
      reference: data.reference ?? '',
      notes: data.notes ?? '',
      currencyCode: data.currencyCode,
      rate: data.unitsPerUsd ?? '',
      freight: data.freightOriginal,
      groups: data.groups.map(createGroup),
    });
    revision.value = current.revision;
  } catch (failure) {
    loadError.value = failureMessage(failure, 'No se pudo abrir el borrador.');
  } finally {
    loading.value = false;
  }
}

function validated(): PurchaseInput | undefined {
  error.value = '';
  const parsed = purchaseInput.safeParse(payload.value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === 'groups' && typeof issue.path[1] === 'number') {
    const group = issue.path[1];
    const index = issue.path[3];
    const size =
      typeof index === 'number' ? payload.value.groups[group]?.lines[index]?.size : undefined;
    error.value = 'Modelo ' + (group + 1) + (size ? ', talla ' + size : '') + '. ' + issue.message;
  } else {
    error.value = issue?.message ?? 'Revisa los datos de la compra.';
  }
}

async function calculate() {
  const input = validated();
  if (!input || active.value) return;
  const before = JSON.stringify(payload.value);
  active.value = 'preview';
  try {
    const result = await previewDraft(input);
    if (before === JSON.stringify(payload.value)) preview.value = result;
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo calcular la vista previa.');
  } finally {
    active.value = undefined;
  }
}

async function useLatestQuote() {
  if (active.value) return;
  error.value = '';
  const code = currency.value;
  const date = asDate(draft.documentAt);
  if (!code || !date) {
    error.value = 'Indica la moneda y la fecha del documento.';
    return;
  }
  active.value = 'quote';
  try {
    const quote = await getQuote(code, date);
    if (code !== currency.value || date !== asDate(draft.documentAt)) return;
    if (quote) draft.rate = quote.unitsPerUsd;
    else
      error.value = 'No hay una tasa registrada para esa fecha. Ingresa la tasa que vas a aplicar.';
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo consultar la tasa.');
  } finally {
    active.value = undefined;
  }
}

async function save() {
  const data = validated();
  if (!data || active.value) return;
  active.value = 'save';
  try {
    const result = props.id
      ? await updateDraft(props.id, revision.value, data)
      : await createDraft(data);
    toast.add({ severity: 'success', summary: 'Borrador guardado', life: 3200 });
    await router.replace({ name: 'purchase-detail', params: { id: result.id } });
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo guardar el borrador.');
  } finally {
    active.value = undefined;
  }
}

function openSupplier() {
  supplierError.value = '';
  supplierDraft.value = { name: '', document: '', phone: '', email: '' };
  supplierOpen.value = true;
}
async function addSupplier() {
  const normalize = (key: string) => String(supplierDraft.value[key] ?? '').trim() || null;
  const parsed = contactInput.safeParse({
    name: normalize('name') ?? '',
    document: normalize('document'),
    phone: normalize('phone'),
    email: normalize('email'),
    address: null,
    notes: null,
  });
  if (!parsed.success) {
    supplierError.value = parsed.error.issues[0]?.message ?? 'Revisa el proveedor.';
    return;
  }
  if (supplierSaving.value) return;
  supplierSaving.value = true;
  try {
    const supplier = await saveRecord('suppliers', null, parsed.data);
    draft.supplierId = supplier.id;
    supplierOpen.value = false;
  } catch (failure) {
    supplierError.value = failureMessage(failure, 'No se pudo crear el proveedor.');
  } finally {
    supplierSaving.value = false;
  }
}
onMounted(load);
</script>

<template>
  <AppShell>
    <RouterLink
      :to="
        id
          ? { name: 'purchase-detail', params: { id } }
          : { name: fromInventory ? 'inventory' : 'purchases' }
      "
      class="inline-action procurement-back"
    >
      {{ id ? 'Volver al detalle' : fromInventory ? 'Volver a existencias' : 'Volver a compras' }}
    </RouterLink>
    <header class="module-heading">
      <div>
        <h1>
          {{ id ? 'Editar borrador' : fromInventory ? 'Agregar existencia' : 'Nueva compra' }}
        </h1>
        <p v-if="fromInventory">
          Elige el proveedor, la marca y el modelo. Marca las tallas e indica cuántos pares
          llegaron.
        </p>
      </div>
    </header>
    <p v-if="loading" class="records-empty" role="status">Cargando compra…</p>
    <Message v-else-if="loadError" severity="error"
      >{{ loadError }}
      <button type="button" class="inline-action" @click="load">Reintentar</button></Message
    >
    <form v-else class="procurement-stack" novalidate @submit.prevent="save">
      <section class="records-panel procurement-card" aria-labelledby="purchase-document">
        <h2 id="purchase-document">Proveedor y moneda</h2>
        <div class="record-fields procurement-fields">
          <div class="record-field">
            <label id="purchase-supplier-label" for="purchase-supplier">Proveedor</label>
            <LookupSelect
              id="purchase-supplier"
              v-model="draft.supplierId"
              labelled-by="purchase-supplier-label"
              resource="suppliers"
            />
            <button
              v-if="session.can('suppliers.create')"
              type="button"
              class="inline-action procurement-inline"
              @click="openSupplier"
            >
              Crear proveedor
            </button>
          </div>
          <div class="record-field">
            <label for="purchase-date">Fecha del documento</label>
            <InputText
              id="purchase-date"
              v-model="draft.documentAt"
              type="datetime-local"
              step="1"
              fluid
            />
            <small class="record-hint">{{ browserTimeZone }}</small>
          </div>
          <div class="record-field">
            <label id="purchase-currency-label" for="purchase-currency">Moneda de la compra</label>
            <LookupSelect
              id="purchase-currency"
              v-model="draft.currencyCode"
              labelled-by="purchase-currency-label"
              resource="currencies"
              @update:model-value="draft.rate = ''"
            />
          </div>
          <div v-if="currency && currency !== 'USD'" class="record-field">
            <label for="purchase-rate">1 USD = X {{ currency }}</label>
            <InputText
              id="purchase-rate"
              v-model="draft.rate"
              inputmode="decimal"
              maxlength="31"
              fluid
            />
            <small class="record-hint"
              >Escribe cuántas unidades de {{ currency }} equivalen a un dólar en esta
              compra.</small
            >
            <Button
              type="button"
              text
              size="small"
              label="Cargar tasa registrada"
              class="procurement-inline"
              :loading="active === 'quote'"
              :disabled="Boolean(active)"
              @click="useLatestQuote"
            />
          </div>
        </div>
        <details class="pos-section">
          <summary>Factura, envío y notas</summary>
          <div class="record-fields procurement-fields">
            <div class="record-field">
              <label for="purchase-reference">Factura o referencia</label>
              <InputText id="purchase-reference" v-model="draft.reference" maxlength="120" fluid />
            </div>
            <div class="record-field">
              <label for="purchase-freight">Costo de envío en {{ currency }}</label
              ><InputText
                id="purchase-freight"
                v-model="draft.freight"
                inputmode="decimal"
                maxlength="25"
                fluid
              />
              <small class="record-hint"
                >Incluye aquí el envío que te cobra el proveedor. Se reparte entre los pares.</small
              >
            </div>
            <div class="record-field record-field-wide">
              <label for="purchase-notes">Observaciones</label
              ><Textarea
                id="purchase-notes"
                v-model="draft.notes"
                maxlength="2000"
                rows="2"
                fluid
              />
            </div>
          </div>
        </details>
      </section>
      <SizeMatrix
        v-for="(group, index) in draft.groups"
        :key="group.key"
        :model-value="group"
        :index="index"
        :currency="currency"
        @update:model-value="draft.groups[index] = $event"
        :can-remove="draft.groups.length > 1"
        :rates="preview?.lines"
        @remove="draft.groups.splice(index, 1)"
      />
      <Button
        v-if="draft.groups.length < 20"
        type="button"
        label="Agregar otro modelo"
        icon="pi pi-plus"
        outlined
        class="procurement-inline"
        @click="draft.groups.push(createGroup())"
      />
      <section class="records-panel procurement-card" aria-labelledby="purchase-preview">
        <div class="procurement-title-line">
          <h2 id="purchase-preview">Vista previa</h2>
          <Button
            type="button"
            outlined
            label="Calcular importes"
            :loading="active === 'preview'"
            :disabled="Boolean(active)"
            @click="calculate"
          />
        </div>
        <PurchaseTotals v-if="preview" :totals="preview" :currency="currency" aria-live="polite" />
        <Message v-if="error" severity="error" class="procurement-feedback">{{ error }}</Message>
        <p class="record-hint">Los pares se suman al inventario al confirmar la recepción.</p>
        <div class="procurement-actions">
          <Button
            type="submit"
            :label="fromInventory ? 'Continuar a recepción' : 'Guardar borrador'"
            icon="pi pi-save"
            :loading="active === 'save'"
            :disabled="Boolean(active)"
          />
        </div>
      </section>
    </form>
    <Dialog
      v-model:visible="supplierOpen"
      header="Nuevo proveedor"
      modal
      :draggable="false"
      class="record-dialog"
    >
      <form class="record-form" novalidate @submit.prevent="addSupplier">
        <RecordFields
          v-model="supplierDraft"
          :fields="contactFields"
          :disabled="supplierSaving"
          prefix="purchase-new-supplier"
        />
        <Message v-if="supplierError" severity="error">{{ supplierError }}</Message>
        <Button
          type="submit"
          label="Crear proveedor"
          class="procurement-inline"
          :loading="supplierSaving"
        />
      </form>
    </Dialog>
  </AppShell>
</template>
