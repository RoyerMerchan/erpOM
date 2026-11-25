<script setup lang="ts">
import { financeEntryInput, financeEntryKind, financeEntryLabels } from '@max-sport/shared';
import type { FinanceEntryConfirmation, FinanceEntryPreview } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { useConfirm } from 'primevue/useconfirm';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import FinanceCategoryManager from '../finance/FinanceCategoryManager.vue';
import FinanceCategorySelect from '../finance/FinanceCategorySelect.vue';
import { confirmFinanceEntry, previewFinanceEntry } from '../finance/service';
import { browserTimeZone, localDateInput } from '../master-data/field-types';
import { asDate, failureMessage, formatMoney, operationKey } from '../purchasing/form';
import { tenderDraft, tenderInput } from '../sales/form';
import TenderFields from '../sales/TenderFields.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const initial = financeEntryKind.safeParse(route.query.kind);
const allowed = computed(() =>
  financeEntryKind.options.filter((kind) =>
    session.can(kind === 'ADJUSTMENT' ? 'finance.adjust' : 'finance.post'),
  ),
);
const kind = ref(
  initial.success && allowed.value.includes(initial.data)
    ? initial.data
    : (allowed.value[0] ?? 'EXPENSE'),
);
const direction = ref<'IN' | 'OUT'>('IN');
const description = ref('');
const reference = ref('');
const occurredAt = ref(localDateInput(new Date()));
const categoryId = ref<string | null>(null);
const payment = ref(tenderDraft());
const destination = ref(tenderDraft());
const editingCategories = ref(false);
const categoryVersion = ref(0);
const error = ref('');
const calculating = ref(false);
const posting = ref(false);
const quote = ref<{ data: FinanceEntryPreview; key: string }>();
const attempt = ref<FinanceEntryConfirmation>();
const idFor = operationKey();
const at = computed(() => asDate(occurredAt.value));
const payload = computed(() =>
  financeEntryInput.safeParse({
    kind: kind.value,
    occurredAt: at.value,
    description: description.value,
    reference: reference.value,
    ...(kind.value === 'TRANSFER'
      ? { source: tenderInput(payment.value), destination: tenderInput(destination.value) }
      : {
          payment: tenderInput(payment.value),
          ...(kind.value === 'EXPENSE' ? { categoryId: categoryId.value } : {}),
          ...(kind.value === 'ADJUSTMENT' ? { direction: direction.value } : {}),
        }),
  }),
);
const fresh = computed(
  () => payload.value.success && quote.value?.key === JSON.stringify(payload.value.data),
);
watch(editingCategories, (value) => {
  if (!value) categoryVersion.value++;
});

async function calculate() {
  if (calculating.value || attempt.value) return;
  if (!payload.value.success) {
    error.value = payload.value.error.issues[0]?.message ?? 'Revisa los datos del movimiento.';
    return;
  }
  const entry = payload.value.data;
  calculating.value = true;
  error.value = '';
  try {
    quote.value = { data: await previewFinanceEntry(entry), key: JSON.stringify(entry) };
  } catch (failure) {
    quote.value = undefined;
    error.value = failureMessage(failure, 'No se pudo calcular el movimiento.');
  } finally {
    calculating.value = false;
  }
}

async function save() {
  if (posting.value) return;
  if (!attempt.value) {
    if (!payload.value.success || !fresh.value || !quote.value) return;
    const body = { quoteDigest: quote.value.data.quoteDigest, entry: payload.value.data };
    attempt.value = { ...body, operationId: idFor(body) };
  }
  error.value = '';
  posting.value = true;
  try {
    const result = await confirmFinanceEntry(attempt.value);
    await router.replace({ name: 'finance-entry', params: { id: result.id } });
  } catch (failure) {
    if (
      failure instanceof ApiRequestError &&
      failure.status &&
      failure.status < 500 &&
      failure.status !== 201
    ) {
      quote.value = undefined;
      attempt.value = undefined;
      error.value = failure.message;
    } else {
      error.value = 'No se pudo comprobar el resultado. Reintenta la misma confirmación.';
    }
  } finally {
    posting.value = false;
  }
}

function requestConfirmation() {
  if (attempt.value) return void save();
  confirm.require({
    header: 'Confirmar movimiento',
    message: 'Se registrarán los importes y tasas de la vista previa en las cuentas seleccionadas.',
    acceptLabel: 'Registrar',
    rejectLabel: 'Volver',
    accept: () => void save(),
  });
}
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <div>
        <RouterLink class="inline-action" :to="{ name: 'finance-income' }"
          >Volver a ingresos y egresos</RouterLink
        >
        <h1>Registrar movimiento</h1>
      </div>
    </header>
    <div class="finance-two-up">
      <section
        class="sale-panel finance-stack"
        aria-labelledby="finance-entry-data"
        :inert="!!attempt"
      >
        <h2 id="finance-entry-data">Datos del registro</h2>
        <div class="finance-fields">
          <div class="field">
            <label for="finance-entry-kind">Tipo</label>
            <select id="finance-entry-kind" v-model="kind" class="sale-native-select">
              <option v-for="value in allowed" :key="value" :value="value">
                {{ financeEntryLabels[value] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label for="finance-entry-at">Fecha del movimiento</label>
            <InputText
              id="finance-entry-at"
              v-model="occurredAt"
              type="datetime-local"
              aria-describedby="finance-entry-tz"
              fluid
            />
            <small id="finance-entry-tz" class="sale-muted">{{ browserTimeZone }}</small>
          </div>
        </div>
        <div v-if="kind === 'EXPENSE'" class="field">
          <label for="finance-entry-category">Categoría de gasto</label>
          <FinanceCategorySelect
            :key="categoryVersion"
            id="finance-entry-category"
            v-model="categoryId"
          />
          <button
            v-if="session.can('finance.categories.manage')"
            type="button"
            class="inline-action"
            @click="editingCategories = true"
          >
            Administrar categorías
          </button>
        </div>
        <div v-if="kind === 'ADJUSTMENT'" class="field">
          <label for="finance-adjust-direction">Dirección del ajuste</label>
          <select id="finance-adjust-direction" v-model="direction" class="sale-native-select">
            <option value="IN">Entrada a la cuenta</option>
            <option value="OUT">Salida de la cuenta</option>
          </select>
        </div>
        <div class="field">
          <label for="finance-description">{{
            kind === 'ADJUSTMENT' ? 'Motivo del ajuste' : 'Concepto'
          }}</label>
          <Textarea id="finance-description" v-model="description" rows="2" maxlength="500" fluid />
        </div>
        <div class="field">
          <label for="finance-reference">Referencia opcional</label>
          <InputText id="finance-reference" v-model="reference" maxlength="120" fluid />
        </div>
        <div class="pos-tender">
          <TenderFields
            v-model="payment"
            :account-label="kind === 'TRANSFER' ? 'Cuenta de origen' : 'Cuenta'"
            :quote-at="at"
            hide-reference
          />
        </div>
        <div v-if="kind === 'TRANSFER'" class="pos-tender">
          <TenderFields
            v-model="destination"
            account-label="Cuenta de destino"
            :quote-at="at"
            hide-reference
          />
        </div>
      </section>

      <section
        class="sale-panel finance-stack"
        aria-labelledby="finance-entry-quote"
        :aria-busy="calculating"
      >
        <h2 id="finance-entry-quote">Vista previa</h2>
        <p v-if="!quote || !fresh" class="sale-muted" role="status">
          {{
            quote
              ? 'Los datos cambiaron. Vuelve a calcular los importes.'
              : 'Calcula los importes antes de registrar el movimiento.'
          }}
        </p>
        <template v-else>
          <ul class="sale-detail-list">
            <li v-for="line in quote.data.lines" :key="line.accountId">
              <div>
                <strong
                  >{{ line.direction === 'IN' ? 'Entrada' : 'Salida' }} ·
                  {{ line.accountName }}</strong
                >
                <span>{{ formatMoney(line.amountOriginal, line.currencyCode) }}</span>
                <span v-if="line.currencyCode !== 'USD'"
                  >1 USD equivale a {{ formatMoney(line.unitsPerUsd, line.currencyCode) }}</span
                >
              </div>
              <strong>{{ formatMoney(line.amountUsd, 'USD') }}</strong>
            </li>
          </ul>
          <dl v-if="quote.data.differenceUsd !== null" class="finance-metrics">
            <div>
              <dt>Diferencia de cambio</dt>
              <dd>{{ formatMoney(quote.data.differenceUsd, 'USD') }}</dd>
            </div>
          </dl>
        </template>
        <Message v-if="error" severity="error">{{ error }}</Message>
        <div class="sale-actions">
          <Button
            type="button"
            label="Calcular"
            icon="pi pi-calculator"
            variant="outlined"
            :loading="calculating"
            :disabled="!!attempt"
            @click="calculate"
          />
          <Button
            type="button"
            :label="attempt && !posting ? 'Reintentar confirmación' : 'Confirmar'"
            icon="pi pi-check"
            :loading="posting"
            :disabled="calculating || (!attempt && !fresh)"
            @click="requestConfirmation"
          />
        </div>
      </section>
    </div>
    <FinanceCategoryManager
      v-if="session.can('finance.categories.manage')"
      v-model="editingCategories"
    />
  </AppShell>
</template>
