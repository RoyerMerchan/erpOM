<script setup lang="ts">
import {
  paymentInput,
  paymentStatusLabels,
  purchaseStatusLabels,
  reasonInput,
} from '@max-sport/shared';
import type { PaymentInput, PurchaseDetail } from '@max-sport/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import { timeLabel } from '../master-data/field-types';
import {
  failureMessage,
  formatMoney,
  operationKey,
  paymentDraft,
  paymentPayload,
} from '../purchasing/form';
import PaymentFields from '../purchasing/PaymentFields.vue';
import PurchaseTotals from '../purchasing/PurchaseTotals.vue';
import {
  getPurchase,
  paySupplier,
  receiveDraft,
  reverseSupplierPayment,
  voidDocument,
} from '../purchasing/service';
import { useSessionStore } from '../stores/session';

type Action = 'receive' | 'pay' | 'void' | 'reverse';
const props = defineProps<{ id: string }>();
const session = useSessionStore();
const toast = useToast();
const order = ref<PurchaseDetail>();
const loading = ref(true);
const error = ref('');
const action = ref<Action>('receive');
const open = ref(false);
const running = ref(false);
const formError = ref('');
const reason = ref('');
const includePayment = ref(false);
const payment = ref(paymentDraft());
const selectedPayment = ref('');
const paymentCurrency = ref('');
let payKey = operationKey();
let confirmationKey = operationKey();
const titles: Record<Action, string> = {
  receive: 'Confirmar recepción',
  pay: 'Registrar pago',
  void: 'Anular compra',
  reverse: 'Revertir pago',
};

const canPay = computed(() => session.can('purchases.pay') && session.can('costs.read'));
const hasRate = computed(() => Boolean(order.value?.financial?.unitsPerUsd));
const canEdit = computed(
  () =>
    order.value?.status === 'DRAFT' && session.can('purchases.update') && session.can('costs.read'),
);
const canReceive = computed(
  () =>
    order.value?.status === 'DRAFT' &&
    session.can('purchases.confirm') &&
    session.can('costs.read'),
);
const canVoid = computed(() =>
  Boolean(order.value && order.value.status !== 'VOIDED' && session.can('purchases.void')),
);
const needsPayment = computed(
  () => action.value === 'pay' || (action.value === 'receive' && includePayment.value),
);
const draftRows = computed(() => {
  const document = order.value;
  if (!document?.draft || !document.preview) return [];
  return document.preview.lines.map((line) => {
    const group = document.draft?.groups[line.group];
    return {
      ...line,
      modelName: document.draftModelLabels?.[line.group] ?? 'Modelo ' + (line.group + 1),
      price: group?.lines.find(({ size }) => size === line.size)?.salePriceUsd,
    };
  });
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    order.value = await getPurchase(props.id);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo consultar la compra.');
  } finally {
    loading.value = false;
  }
}

function show(mode: Action, paymentId = '') {
  payKey = operationKey();
  confirmationKey = operationKey();
  action.value = mode;
  selectedPayment.value = paymentId;
  reason.value = '';
  formError.value = '';
  payment.value = paymentDraft();
  paymentCurrency.value = '';
  includePayment.value = false;
  open.value = true;
}

async function apply() {
  const current = order.value;
  if (!current || running.value) return;
  formError.value = '';
  let input: PaymentInput | undefined;
  if (needsPayment.value) {
    if (!paymentCurrency.value) {
      formError.value = 'Selecciona una cuenta de salida.';
      return;
    }
    const parsed = paymentInput.safeParse(
      paymentPayload(payment.value, payKey, paymentCurrency.value),
    );
    if (!parsed.success) {
      formError.value = parsed.error.issues[0]?.message ?? 'Revisa el pago.';
      return;
    }
    input = parsed.data;
  }
  running.value = true;
  try {
    if (action.value === 'receive') {
      const body = { revision: current.revision, ...(input ? { initialPayment: input } : {}) };
      order.value = await receiveDraft(current.id, { ...body, operationId: confirmationKey(body) });
    } else if (action.value === 'pay' && input) {
      order.value = await paySupplier(current.id, input);
    } else {
      const verified = reasonInput.safeParse({ reason: reason.value });
      if (!verified.success) {
        formError.value = 'Ingresa un motivo.';
        return;
      }
      order.value =
        action.value === 'void'
          ? await voidDocument(current.id, verified.data.reason)
          : await reverseSupplierPayment(current.id, selectedPayment.value, verified.data.reason);
    }
    open.value = false;
    toast.add({
      severity: 'success',
      summary:
        action.value === 'receive'
          ? 'Compra recibida y existencias actualizadas'
          : 'Compra actualizada',
      life: 3200,
    });
  } catch (failure) {
    formError.value = failureMessage(failure, 'No se pudo registrar la operación.');
  } finally {
    running.value = false;
  }
}
onMounted(load);
</script>

<template>
  <AppShell>
    <RouterLink :to="{ name: 'purchases' }" class="inline-action procurement-back"
      >Volver a compras</RouterLink
    >
    <p v-if="loading" class="records-empty" role="status">Cargando compra…</p>
    <Message v-else-if="error" severity="error"
      >{{ error }}
      <button type="button" class="inline-action" @click="load">Reintentar</button></Message
    >

    <template v-else-if="order">
      <header class="module-heading">
        <div>
          <PageHeading :title="order.reference || 'Detalle de compra'" />
          <p>{{ order.supplierName }} · {{ timeLabel(order.documentAt) }}</p>
        </div>
        <div class="procurement-actions">
          <RouterLink
            v-if="canEdit"
            :to="{ name: 'purchase-edit', params: { id } }"
            class="p-button p-component p-button-outlined"
            >Editar borrador</RouterLink
          >
          <Button
            v-if="canReceive"
            label="Confirmar recepción"
            icon="pi pi-check"
            :disabled="!hasRate"
            @click="show('receive')"
          />
          <Button
            v-if="canPay && order.status === 'CONFIRMED' && order.paymentStatus !== 'PAID'"
            label="Registrar pago"
            icon="pi pi-wallet"
            @click="show('pay')"
          />
        </div>
      </header>
      <div class="procurement-stack">
        <section class="records-panel procurement-card" aria-label="Resumen de la compra">
          <div class="procurement-title-line">
            <h2>Resumen</h2>
            <div class="procurement-actions">
              <Tag
                :value="purchaseStatusLabels[order.status]"
                :severity="order.status === 'CONFIRMED' ? 'success' : 'secondary'"
              />
              <Tag
                v-if="order.paymentStatus"
                :value="paymentStatusLabels[order.paymentStatus]"
                severity="info"
              />
            </div>
          </div>
          <p v-if="order.receivedAt" class="record-hint">
            Recepción {{ timeLabel(order.receivedAt) }}
          </p>
          <PurchaseTotals
            v-if="order.financial"
            :totals="order.financial"
            :currency="order.currencyCode"
          />
          <p v-else>{{ order.pairCount }} pares · {{ order.currencyCode }}</p>
          <p v-if="canReceive && !hasRate" class="record-hint">
            Completa la tasa en el borrador para confirmar la compra.
          </p>
          <p v-if="order.notes" class="procurement-text">{{ order.notes }}</p>
          <Message v-if="order.voidReason" severity="warn"
            >Motivo de anulación. {{ order.voidReason }}</Message
          >
          <Button
            v-if="canVoid"
            text
            severity="danger"
            label="Anular compra"
            class="procurement-inline"
            @click="show('void')"
          />
        </section>

        <section
          v-if="draftRows.length"
          class="records-panel procurement-table"
          aria-labelledby="draft-lines"
        >
          <h2 id="draft-lines">Vista previa por talla</h2>
          <DataTable
            :value="draftRows"
            :table-style="{ minWidth: '48rem' }"
            scrollable
            :pt="{
              tableContainer: {
                tabindex: 0,
                role: 'region',
                'aria-label': 'Vista previa por talla',
              },
            }"
          >
            <Column field="modelName" header="Modelo" /><Column
              field="size"
              header="Talla"
            /><Column field="quantity" header="Pares" />
            <Column header="Costo/par"
              ><template #body="{ data }">{{
                formatMoney(data.unitCostOriginal, order.currencyCode)
              }}</template></Column
            >
            <Column header="Flete"
              ><template #body="{ data }">{{
                formatMoney(data.freightOriginal, order.currencyCode)
              }}</template></Column
            >
            <Column header="Total original"
              ><template #body="{ data }">{{
                formatMoney(data.totalOriginal, order.currencyCode)
              }}</template></Column
            >
            <Column header="Costo/par USD"
              ><template #body="{ data }">{{
                formatMoney(data.unitCostUsd, 'USD')
              }}</template></Column
            >
            <Column header="Total USD"
              ><template #body="{ data }">{{ formatMoney(data.totalUsd, 'USD') }}</template></Column
            >
            <Column header="Precio USD"
              ><template #body="{ data }">{{ formatMoney(data.price, 'USD') }}</template></Column
            >
          </DataTable>
        </section>

        <section
          v-if="order.items.length"
          class="records-panel procurement-table"
          aria-labelledby="received-lines"
        >
          <h2 id="received-lines">Detalle de mercancía</h2>
          <DataTable
            :value="order.items"
            data-key="id"
            :table-style="{ minWidth: '43rem' }"
            scrollable
            :pt="{
              tableContainer: { tabindex: 0, role: 'region', 'aria-label': 'Productos comprados' },
            }"
          >
            <Column header="Producto"
              ><template #body="{ data }"
                >{{ data.brandName }} · {{ data.modelName
                }}<small v-if="data.color"> · {{ data.color }}</small></template
              ></Column
            >
            <Column field="size" header="Talla" /><Column field="quantity" header="Pares" />
            <Column header="Precio USD"
              ><template #body="{ data }">{{
                formatMoney(data.salePriceUsd, 'USD')
              }}</template></Column
            >
            <Column v-if="order.financial" header="Costo/par"
              ><template #body="{ data }">{{
                formatMoney(data.costs?.unitCostOriginal, order.currencyCode)
              }}</template></Column
            >
            <Column v-if="order.financial" header="Costo/par USD"
              ><template #body="{ data }">{{
                formatMoney(data.costs?.unitCostUsd, 'USD')
              }}</template></Column
            >
            <Column v-if="order.financial" header="Total USD"
              ><template #body="{ data }">{{
                formatMoney(data.costs?.totalUsd, 'USD')
              }}</template></Column
            >
          </DataTable>
        </section>

        <section
          v-if="order.payments && order.receivedAt"
          class="records-panel procurement-table"
          aria-labelledby="purchase-payments"
        >
          <h2 id="purchase-payments">Pagos al proveedor</h2>
          <DataTable
            :value="order.payments"
            data-key="id"
            :table-style="{ minWidth: '42rem' }"
            scrollable
            :pt="{
              tableContainer: { tabindex: 0, role: 'region', 'aria-label': 'Pagos de la compra' },
            }"
          >
            <template #empty>
              <p class="records-empty" role="status">Aún no hay pagos registrados.</p>
            </template>
            <Column field="accountName" header="Cuenta" />
            <Column header="Fecha"
              ><template #body="{ data }">{{ timeLabel(data.paidAt) }}</template></Column
            >
            <Column header="Importe"
              ><template #body="{ data }">{{
                formatMoney(data.amountOriginal, data.currencyCode)
              }}</template></Column
            >
            <Column header="USD"
              ><template #body="{ data }">{{
                formatMoney(data.amountUsd, 'USD')
              }}</template></Column
            >
            <Column header="Tasa"
              ><template #body="{ data }"
                >1 USD = {{ formatMoney(data.unitsPerUsd, data.currencyCode) }}</template
              ></Column
            >
            <Column header="Estado"
              ><template #body="{ data }"
                ><Tag
                  :value="data.reversedAt ? 'Revertido' : 'Registrado'"
                  :severity="data.reversedAt ? 'secondary' : 'success'" /></template
            ></Column>
            <Column v-if="canPay" header="Acción"
              ><template #body="{ data }">
                <Button
                  v-if="!data.reversedAt && order.status === 'CONFIRMED'"
                  label="Revertir"
                  text
                  size="small"
                  severity="danger"
                  @click="show('reverse', data.id)"
                />
                <small v-else-if="data.reversalReason">{{ data.reversalReason }}</small>
              </template></Column
            >
          </DataTable>
        </section>
      </div>
    </template>

    <Dialog
      v-model:visible="open"
      :header="titles[action]"
      modal
      :draggable="false"
      :closable="!running"
      :close-on-escape="!running"
      class="record-dialog"
    >
      <form class="record-form" novalidate @submit.prevent="apply">
        <template v-if="action === 'receive'">
          <p>
            La recepción sumará {{ order?.pairCount }} pares a inventario y conservará la tasa y los
            costos de esta compra.
          </p>
          <div v-if="canPay && order?.financial?.totalUsd !== '0.00'" class="checkbox-label">
            <Checkbox v-model="includePayment" input-id="payment-at-reception" binary />
            <label for="payment-at-reception">Registrar un pago en esta recepción</label>
          </div>
        </template>
        <PaymentFields
          v-if="needsPayment"
          v-model="payment"
          v-model:currency="paymentCurrency"
          :disabled="running"
        />
        <div v-if="action === 'void' || action === 'reverse'" class="record-field">
          <p v-if="action === 'reverse'" class="record-hint">
            Registra la reversión cuando la cuenta reciba la devolución o se corrija un pago
            ingresado por error.
          </p>
          <p v-else class="record-hint">
            Las recepciones intactas se compensan con una salida. Revierte primero cualquier pago
            activo.
          </p>
          <label for="purchase-action-reason">Motivo</label>
          <Textarea id="purchase-action-reason" v-model="reason" maxlength="500" rows="3" fluid />
        </div>
        <Message v-if="formError" severity="error">{{ formError }}</Message>
        <div class="record-form-actions">
          <Button
            label="Cancelar"
            severity="secondary"
            outlined
            :disabled="running"
            @click="open = false"
          />
          <Button
            :label="titles[action]"
            type="submit"
            :severity="action === 'void' || action === 'reverse' ? 'danger' : 'primary'"
            :loading="running"
            :disabled="running"
          />
        </div>
      </form>
    </Dialog>
  </AppShell>
</template>
