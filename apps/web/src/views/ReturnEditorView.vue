<script setup lang="ts">
import { correctionInput } from '@max-sport/shared';
import type { ConfirmCorrectionInput, CorrectionPreview, SaleDetail } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useConfirm } from 'primevue/useconfirm';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { cartInput, paymentInputs } from '../after-sale/form';
import type { StockSelection } from '../after-sale/form';
import { confirmCorrection, previewCorrection } from '../after-sale/service';
import StockCart from '../after-sale/StockCart.vue';
import TenderList from '../after-sale/TenderList.vue';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import { failureMessage, formatMoney, operationKey } from '../purchasing/form';
import type { TenderDraft } from '../sales/form';
import { getSale } from '../sales/service';

const props = defineProps<{ saleId: string }>();
const router = useRouter();
const confirm = useConfirm();
const original = ref<SaleDetail>();
const lines = ref<
  {
    id: string;
    modelName: string;
    sku: string;
    size: number;
    available: number;
    sellable: string;
    damaged: string;
  }[]
>([]);
const mode = ref<'RETURN' | 'EXCHANGE'>('RETURN');
const replacement = ref<StockSelection[]>([]);
const money = ref<TenderDraft[]>([]);
const reason = ref('');
const notes = ref('');
const loading = ref(true);
const calculating = ref(false);
const posting = ref(false);
const error = ref('');
const quote = ref<{ data: CorrectionPreview; key: string; selectionKey: string }>();
const quoteInvalid = ref(false);
const attempt = ref<ConfirmCorrectionInput>();
const idFor = operationKey();

const moneySide = (data: CorrectionPreview | undefined) =>
  !data || data.differenceUsd === '0.00'
    ? null
    : data.differenceUsd.startsWith('-')
      ? 'refund'
      : 'charge';
const selection = computed(() => ({
  items: lines.value.flatMap((line) =>
    [
      { saleItemId: line.id, condition: 'SELLABLE', quantity: Number(line.sellable) },
      { saleItemId: line.id, condition: 'DEFECTIVE', quantity: Number(line.damaged) },
    ].filter(({ quantity }) => quantity !== 0),
  ),
  replacement: mode.value === 'EXCHANGE' ? cartInput(replacement.value) : [],
}));
const selectionKey = computed(() => JSON.stringify(selection.value));
const currentMoneySide = computed(() =>
  quote.value?.selectionKey === selectionKey.value ? moneySide(quote.value.data) : null,
);
const payload = computed(() => {
  const amounts = paymentInputs(money.value);
  return correctionInput.safeParse({
    saleId: props.saleId,
    ...selection.value,
    reason: reason.value,
    notes: notes.value,
    refunds: currentMoneySide.value === 'refund' ? amounts : [],
    payments: currentMoneySide.value === 'charge' ? amounts : [],
  });
});
const fresh = computed(
  () =>
    !quoteInvalid.value &&
    payload.value.success &&
    quote.value?.key === JSON.stringify(payload.value.data),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    original.value = await getSale(props.saleId);
    lines.value = original.value.items
      .map((line) => ({
        id: line.id,
        modelName: line.modelName,
        sku: line.sku,
        size: line.size,
        available: line.returnableQuantity ?? line.quantity,
        sellable: '',
        damaged: '',
      }))
      .filter(({ available }) => available > 0);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo cargar la venta.');
  } finally {
    loading.value = false;
  }
}

async function calculate() {
  if (calculating.value || attempt.value) return;
  if (mode.value === 'EXCHANGE' && !replacement.value.length) {
    error.value = 'Agrega una talla de reemplazo.';
    return;
  }
  if (!payload.value.success) {
    error.value = payload.value.error.issues[0]?.message ?? 'Revisa el movimiento.';
    return;
  }
  const selected = payload.value.data;
  const before = selectionKey.value;
  calculating.value = true;
  error.value = '';
  try {
    const updated = await previewCorrection(selected);
    if (before !== selectionKey.value) return;
    if (before !== quote.value?.selectionKey || moneySide(updated) !== moneySide(quote.value?.data))
      money.value = [];
    quote.value = { data: updated, key: JSON.stringify(selected), selectionKey: before };
    quoteInvalid.value = false;
  } catch (failure) {
    quoteInvalid.value = true;
    error.value = failureMessage(failure, 'No se pudo calcular el movimiento.');
  } finally {
    calculating.value = false;
  }
}

async function save() {
  if (posting.value) return;
  if (!attempt.value) {
    if (!payload.value.success || !fresh.value || !quote.value?.data.ready) return;
    const body = { quoteDigest: quote.value.data.quoteDigest, correction: payload.value.data };
    attempt.value = { ...body, operationId: idFor(body) };
  }
  posting.value = true;
  error.value = '';
  try {
    const record = await confirmCorrection(attempt.value);
    await router.replace({ name: 'return-detail', params: { id: record.id } });
  } catch (failure) {
    if (failure instanceof ApiRequestError && failure.status && failure.status < 500) {
      attempt.value = undefined;
      quoteInvalid.value = true;
      error.value = failure.message;
    } else {
      error.value = 'No se pudo comprobar el resultado. Reintenta la misma confirmación.';
    }
  } finally {
    posting.value = false;
  }
}

function requestConfirmation() {
  if (attempt.value) {
    void save();
    return;
  }
  confirm.require({
    header: 'Confirmar movimiento',
    message:
      'Se registrarán la rectificación de la venta y los movimientos de inventario y cuenta calculados.',
    acceptLabel: 'Registrar movimiento',
    rejectLabel: 'Volver',
    accept: () => void save(),
  });
}
onMounted(() => void load());
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <div>
        <RouterLink :to="{ name: 'sale-detail', params: { id: saleId } }" class="inline-action"
          >Volver al comprobante</RouterLink
        >
        <PageHeading title="Cambio o devolución" />
        <p v-if="original">{{ original.receiptNumber }} · {{ original.customerName }}</p>
      </div>
    </header>
    <p v-if="loading" class="sale-muted" role="status">Cargando venta original…</p>
    <Message v-if="!original && error" severity="error">
      {{ error }} <button class="inline-action" type="button" @click="load">Reintentar</button>
    </Message>
    <Message v-if="original && !lines.length" severity="warn"
      >Todos los pares de esta venta ya fueron devueltos.</Message
    >
    <div v-if="lines.length" class="sale-detail-layout">
      <div class="activity-stack" :inert="!!attempt">
        <section class="sale-panel activity-stack" aria-labelledby="return-lines">
          <h2 id="return-lines">Pares devueltos</h2>
          <div v-for="line in lines" :key="line.id" class="pos-line activity-stack">
            <div class="pos-product-info">
              <strong>{{ line.modelName }}</strong>
              <small
                >Talla {{ line.size }} · {{ line.sku }} · {{ line.available }} aún devolubles</small
              >
            </div>
            <div class="sale-fields">
              <div class="field">
                <label :for="line.id + '-good'">Reingresables</label>
                <InputText
                  :id="line.id + '-good'"
                  v-model="line.sellable"
                  inputmode="numeric"
                  maxlength="6"
                  fluid
                />
              </div>
              <div class="field">
                <label :for="line.id + '-bad'">No reingresables</label>
                <InputText
                  :id="line.id + '-bad'"
                  v-model="line.damaged"
                  inputmode="numeric"
                  maxlength="6"
                  fluid
                />
              </div>
            </div>
          </div>
          <div class="field">
            <label for="return-mode">Tipo de movimiento</label>
            <select id="return-mode" v-model="mode" class="sale-native-select">
              <option value="RETURN">Devolución</option>
              <option value="EXCHANGE">Cambio por otro par</option>
            </select>
          </div>
        </section>
        <StockCart v-if="mode === 'EXCHANGE'" v-model="replacement" heading="Tallas de reemplazo" />
      </div>
      <section class="sale-panel activity-stack" aria-labelledby="return-review">
        <h2 id="return-review">Cobro o reembolso</h2>
        <div class="activity-stack" :inert="!!attempt">
          <div class="field">
            <label for="return-reason">Motivo</label>
            <InputText id="return-reason" v-model="reason" maxlength="500" fluid />
          </div>
          <div class="field">
            <label for="return-notes">Notas internas</label>
            <Textarea id="return-notes" v-model="notes" rows="2" maxlength="2000" fluid />
          </div>
          <TenderList
            v-if="currentMoneySide"
            v-model="money"
            :label="currentMoneySide === 'refund' ? 'Reembolso' : 'Cobro'"
          />
        </div>
        <div v-if="quote && fresh" class="activity-stack" aria-live="polite">
          <dl class="activity-summary">
            <div>
              <dt>Importe devuelto</dt>
              <dd>{{ formatMoney(quote.data.returnedUsd, 'USD') }}</dd>
            </div>
            <div v-if="mode === 'EXCHANGE'">
              <dt>Reemplazo</dt>
              <dd>{{ formatMoney(quote.data.replacementTotalUsd, 'USD') }}</dd>
            </div>
            <div>
              <dt>
                {{
                  moneySide(quote.data) === 'refund'
                    ? 'Reembolso requerido'
                    : 'Diferencia por cobrar'
                }}
              </dt>
              <dd>
                <strong>{{
                  formatMoney(quote.data.differenceUsd.replace(/^-/, ''), 'USD')
                }}</strong>
              </dd>
            </div>
            <div v-if="moneySide(quote.data) === 'refund'">
              <dt>Reembolso ingresado</dt>
              <dd>{{ formatMoney(quote.data.refundedUsd, 'USD') }}</dd>
            </div>
            <div v-if="moneySide(quote.data) === 'charge'">
              <dt>Cobro ingresado</dt>
              <dd>{{ formatMoney(quote.data.collectedUsd, 'USD') }}</dd>
            </div>
            <div v-if="quote.data.restoredCogsUsd !== undefined">
              <dt>Costo que vuelve a inventario</dt>
              <dd>{{ formatMoney(quote.data.restoredCogsUsd, 'USD') }}</dd>
            </div>
          </dl>
          <p v-if="!quote.data.ready" class="sale-muted">
            Completa el cobro o el reembolso por el importe requerido.
          </p>
        </div>
        <p v-else class="sale-muted" role="status">
          {{
            quote
              ? 'Los datos cambiaron. Vuelve a calcular el movimiento.'
              : 'Calcula para saber cuánto debes cobrar o devolver.'
          }}
        </p>
        <Message v-if="error" severity="error">{{ error }}</Message>
        <div class="sale-actions">
          <Button
            label="Calcular"
            icon="pi pi-calculator"
            variant="outlined"
            :loading="calculating"
            :disabled="!!attempt"
            @click="calculate"
          />
          <Button
            :label="attempt && !posting ? 'Reintentar confirmación' : 'Confirmar'"
            icon="pi pi-check"
            :loading="posting"
            :disabled="calculating || (!attempt && (!fresh || !quote?.data.ready))"
            @click="requestConfirmation"
          />
        </div>
      </section>
    </div>
  </AppShell>
</template>
