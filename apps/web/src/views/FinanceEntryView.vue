<script setup lang="ts">
import { financeEntryLabels, financeReversalInput } from '@max-sport/shared';
import type { FinanceEntry } from '@max-sport/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import { financeMoment } from '../finance/form';
import { getFinanceEntry, reverseFinanceEntry } from '../finance/service';
import { browserTimeZone } from '../master-data/field-types';
import { asDate, failureMessage, formatMoney, operationKey } from '../purchasing/form';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ id: string }>();
const session = useSessionStore();
const router = useRouter();
const record = ref<FinanceEntry>();
const error = ref('');
const reversing = ref(false);
const reason = ref('');
const reversalAt = ref('');
const saving = ref(false);
const saveError = ref('');
const idFor = operationKey();
const zone = computed(() => session.shop?.timezone ?? 'America/Caracas');
const mayReverse = computed(() => {
  const value = record.value;
  return (
    value &&
    !value.reversesId &&
    !value.reversalId &&
    session.can('finance.reverse') &&
    (value.kind !== 'ADJUSTMENT' || session.can('finance.adjust'))
  );
});

async function load() {
  error.value = '';
  try {
    record.value = await getFinanceEntry(props.id);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo cargar el registro.');
  }
}

function startReversal() {
  reason.value = '';
  reversalAt.value = '';
  saveError.value = '';
  reversing.value = true;
}

async function reverse() {
  if (saving.value || !mayReverse.value) return;
  const body = {
    reason: reason.value,
    occurredAt: reversalAt.value ? asDate(reversalAt.value) : null,
  };
  const input = financeReversalInput.safeParse({ ...body, operationId: idFor(body) });
  if (!input.success) {
    saveError.value = input.error.issues[0]?.message ?? 'Revisa el motivo del reverso.';
    return;
  }
  saveError.value = '';
  saving.value = true;
  try {
    const reversed = await reverseFinanceEntry(props.id, input.data);
    reversing.value = false;
    await router.replace({ name: 'finance-entry', params: { id: reversed.id } });
  } catch (failure) {
    saveError.value = failureMessage(
      failure,
      'No se pudo comprobar el reverso. Reintenta con los mismos datos.',
    );
  } finally {
    saving.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <div>
        <RouterLink class="inline-action" :to="{ name: 'finance-movements' }"
          >Volver a movimientos</RouterLink
        >
        <PageHeading
          :title="
            record ? (record.reversesId ? 'Reverso ' : '') + record.number : 'Detalle financiero'
          "
        />
      </div>
      <Button
        v-if="mayReverse"
        type="button"
        label="Registrar reverso"
        icon="pi pi-replay"
        severity="danger"
        variant="outlined"
        @click="startReversal"
      />
    </header>
    <Message v-if="error" severity="error">
      {{ error }} <button type="button" class="inline-action" @click="load">Reintentar</button>
    </Message>
    <p v-else-if="!record" role="status" class="sale-muted">Cargando registro…</p>
    <div v-if="record" class="finance-two-up">
      <section class="sale-panel finance-stack" aria-labelledby="manual-entry-detail">
        <h2 id="manual-entry-detail">{{ financeEntryLabels[record.kind] }}</h2>
        <dl class="finance-metrics">
          <div>
            <dt>Fecha del movimiento</dt>
            <dd>{{ financeMoment(record.occurredAt, zone) }}</dd>
          </div>
          <div>
            <dt>Registrado</dt>
            <dd>{{ financeMoment(record.createdAt, zone) }}</dd>
          </div>
          <div>
            <dt>Responsable</dt>
            <dd>{{ record.actorName }}</dd>
          </div>
          <div v-if="record.reference">
            <dt>Referencia</dt>
            <dd>{{ record.reference }}</dd>
          </div>
          <div v-if="record.categoryName">
            <dt>Categoría</dt>
            <dd>{{ record.categoryName }}</dd>
          </div>
        </dl>
        <p class="sale-notes">{{ record.description }}</p>
        <RouterLink
          v-if="record.reversesId"
          class="inline-action"
          :to="{ name: 'finance-entry', params: { id: record.reversesId } }"
          >Ver registro original</RouterLink
        >
        <RouterLink
          v-if="record.reversalId"
          class="inline-action"
          :to="{ name: 'finance-entry', params: { id: record.reversalId } }"
          >Ver reverso registrado</RouterLink
        >
      </section>
      <section class="sale-panel finance-stack" aria-labelledby="manual-entry-ledger">
        <h2 id="manual-entry-ledger">Cuentas e importes</h2>
        <ul class="sale-detail-list">
          <li v-for="line in record.lines" :key="line.id">
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
        <dl v-if="record.differenceUsd !== null" class="finance-metrics">
          <div>
            <dt>Diferencia de cambio</dt>
            <dd>{{ formatMoney(record.differenceUsd, 'USD') }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <Dialog
      v-model:visible="reversing"
      modal
      header="Registrar reverso"
      :style="{ width: 'min(92vw, 32rem)' }"
      :closable="!saving"
    >
      <form class="finance-stack" @submit.prevent="reverse">
        <p class="sale-muted">
          El reverso aplica los mismos importes y tasas en sentido contrario.
        </p>
        <div class="field">
          <label for="finance-reverse-reason">Motivo</label>
          <Textarea
            id="finance-reverse-reason"
            v-model="reason"
            maxlength="500"
            rows="2"
            required
            fluid
          />
        </div>
        <div class="field">
          <label for="finance-reverse-at">Fecha del reverso</label>
          <InputText
            id="finance-reverse-at"
            v-model="reversalAt"
            type="datetime-local"
            aria-describedby="finance-reverse-zone"
            fluid
          />
          <small id="finance-reverse-zone" class="sale-muted"
            >Por defecto ahora · {{ browserTimeZone }}</small
          >
        </div>
        <Message v-if="saveError" severity="error">{{ saveError }}</Message>
        <Button type="submit" label="Confirmar reverso" severity="danger" :loading="saving" />
      </form>
    </Dialog>
  </AppShell>
</template>
