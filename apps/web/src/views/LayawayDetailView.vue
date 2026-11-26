<script setup lang="ts">
import {
  closeLayawayInput,
  depositLayawayInput,
  layawayRefundLabels,
  layawayStatusLabels,
} from '@max-sport/shared';
import type { LayawayDetail } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { computed, onMounted, ref } from 'vue';
import { paymentInputs } from '../after-sale/form';
import { closeLayaway, deliverLayaway, getLayaway, payLayaway } from '../after-sale/service';
import TenderList from '../after-sale/TenderList.vue';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import { timeLabel } from '../master-data/field-types';
import { failureMessage, formatMoney, operationKey } from '../purchasing/form';
import { tenderDraft } from '../sales/form';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ id: string }>();
const session = useSessionStore();
const confirm = useConfirm();
const record = ref<LayawayDetail>();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const payments = ref([tenderDraft()]);
const reason = ref('');
const idFor = operationKey();
const actionLabels: Record<LayawayDetail['actions'][number]['kind'], string> = {
  CREATE: 'Reserva creada',
  PAY: 'Abono recibido',
  DELIVER: 'Apartado entregado',
  CANCEL: 'Apartado cancelado',
  EXPIRE: 'Vencimiento cerrado',
};
const open = computed(() => record.value?.status === 'ACTIVE' || record.value?.status === 'PAID');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    record.value = await getLayaway(props.id);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo cargar el apartado.');
  } finally {
    loading.value = false;
  }
}

async function update(execute: () => Promise<LayawayDetail>) {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    record.value = await execute();
    payments.value = [tenderDraft()];
    reason.value = '';
  } catch (failure) {
    error.value = failureMessage(
      failure,
      'No se pudo comprobar la operación. Reintenta con los mismos datos.',
    );
  } finally {
    saving.value = false;
  }
}

function registerPayment() {
  const body = { payments: paymentInputs(payments.value) };
  const input = depositLayawayInput.safeParse({
    ...body,
    operationId: idFor({ action: 'pay', body }),
  });
  if (!input.success) {
    error.value = input.error.issues[0]?.message ?? 'Revisa el abono.';
    return;
  }
  void update(() => payLayaway(props.id, input.data));
}

function deliver() {
  confirm.require({
    header: 'Entregar apartado',
    message:
      'Se registrará la venta y se entregarán los pares reservados. Los abonos existentes se aplicarán al comprobante.',
    acceptLabel: 'Entregar',
    rejectLabel: 'Volver',
    accept: () => void update(() => deliverLayaway(props.id, idFor({ action: 'deliver' }))),
  });
}

function close() {
  const expired = !!record.value?.overdue;
  const input = closeLayawayInput.safeParse({
    reason: reason.value,
    operationId: idFor({ action: 'close', expired, reason: reason.value }),
  });
  if (!input.success) {
    error.value = input.error.issues[0]?.message ?? 'Indica el motivo.';
    return;
  }
  const policy =
    record.value?.refundPolicy === 'FULL_REFUND'
      ? 'Se devolverán los abonos a las cuentas originales.'
      : 'Se retendrán los abonos según la política del apartado.';
  confirm.require({
    header: expired ? 'Cerrar apartado vencido' : 'Cancelar apartado',
    message: 'Se liberarán las tallas reservadas. ' + policy,
    acceptLabel: expired ? 'Cerrar' : 'Cancelar apartado',
    rejectLabel: 'Volver',
    accept: () => void update(() => closeLayaway(props.id, expired, input.data)),
  });
}

onMounted(() => void load());
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <div>
        <RouterLink :to="{ name: 'layaways' }" class="inline-action">Volver a apartados</RouterLink>
        <PageHeading :title="record ? 'Apartado ' + record.number : 'Detalle de apartado'" />
      </div>
      <RouterLink
        v-if="record?.saleId"
        :to="{ name: 'sale-detail', params: { id: record.saleId } }"
        class="p-button p-component"
      >
        <i class="pi pi-receipt" aria-hidden="true" /> Ver comprobante
      </RouterLink>
    </header>
    <Message v-if="error" severity="error" class="activity-message">
      {{ error }}
      <button type="button" class="inline-action" @click="load">Actualizar apartado</button>
    </Message>
    <p v-if="loading" class="sale-muted" role="status">Cargando apartado…</p>
    <div v-if="record" class="sale-detail-layout">
      <section class="sale-panel activity-stack" aria-labelledby="layaway-summary">
        <header class="sale-panel-header">
          <h2 id="layaway-summary">{{ record.customerName }}</h2>
          <span class="sale-count">{{ layawayStatusLabels[record.status] }}</span>
        </header>
        <dl class="sale-meta">
          <div>
            <dt>Vendedor</dt>
            <dd>{{ record.sellerName }}</dd>
          </div>
          <div>
            <dt>Creado</dt>
            <dd>{{ timeLabel(record.createdAt) }}</dd>
          </div>
          <div v-if="record.expiresAt">
            <dt>Vencimiento</dt>
            <dd>{{ timeLabel(record.expiresAt) }}</dd>
          </div>
        </dl>
        <Message v-if="record.overdue" severity="warn"
          >Vencido. El cierre libera las tallas reservadas.</Message
        >
        <ul class="sale-receipt-items" aria-label="Tallas del apartado">
          <li v-for="item in record.items" :key="item.id">
            <div>
              <strong>{{ item.brandName }} {{ item.modelName }}</strong>
              <span>{{ item.quantity }} × talla {{ item.size }} · {{ item.sku }}</span>
            </div>
            <strong>{{ formatMoney(item.totalUsd, 'USD') }}</strong>
          </li>
        </ul>
        <dl class="activity-summary">
          <div>
            <dt>Total acordado</dt>
            <dd>{{ formatMoney(record.totalUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>Anticipos recibidos</dt>
            <dd>{{ formatMoney(record.paidUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>Saldo pendiente</dt>
            <dd>
              <strong>{{ formatMoney(record.balanceUsd, 'USD') }}</strong>
            </dd>
          </div>
          <div v-if="record.refundedUsd !== '0.00'">
            <dt>Reembolsado</dt>
            <dd>{{ formatMoney(record.refundedUsd, 'USD') }}</dd>
          </div>
          <div v-if="record.retainedUsd !== '0.00'">
            <dt>Retenido</dt>
            <dd>{{ formatMoney(record.retainedUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>Política de cancelación</dt>
            <dd>{{ layawayRefundLabels[record.refundPolicy] }}</dd>
          </div>
        </dl>
        <p v-if="record.notes" class="sale-notes">{{ record.notes }}</p>
      </section>

      <div class="activity-stack">
        <section
          v-if="record.status === 'ACTIVE' && !record.overdue && session.can('layaways.pay')"
          class="sale-panel activity-stack"
          aria-labelledby="layaway-payment"
        >
          <h2 id="layaway-payment">Registrar abono</h2>
          <form class="activity-stack" @submit.prevent="registerPayment">
            <TenderList v-model="payments" label="Abono" />
            <Button type="submit" label="Guardar abono" icon="pi pi-wallet" :loading="saving" />
          </form>
        </section>
        <Button
          v-if="record.status === 'PAID' && !record.overdue && session.can('layaways.deliver')"
          label="Confirmar entrega"
          icon="pi pi-check"
          :loading="saving"
          @click="deliver"
        />
        <section
          v-if="open && session.can('layaways.cancel')"
          class="sale-panel activity-stack"
          aria-labelledby="layaway-close"
        >
          <h2 id="layaway-close">
            {{ record.overdue ? 'Cerrar vencimiento' : 'Cancelar apartado' }}
          </h2>
          <form class="activity-stack" @submit.prevent="close">
            <div class="field">
              <label for="layaway-close-reason">Motivo</label>
              <InputText
                id="layaway-close-reason"
                v-model="reason"
                maxlength="500"
                required
                fluid
              />
            </div>
            <Button
              type="submit"
              severity="danger"
              variant="outlined"
              :loading="saving"
              :label="record.overdue ? 'Cerrar vencimiento' : 'Cancelar apartado'"
            />
          </form>
        </section>
        <section class="sale-panel activity-stack" aria-labelledby="layaway-history">
          <h2 id="layaway-history">Historial</h2>
          <ul class="sale-detail-list">
            <li v-for="action in record.actions" :key="action.id">
              <div>
                <strong>{{ actionLabels[action.kind] }}</strong>
                <span>{{ timeLabel(action.occurredAt) }} · {{ action.actorName }}</span>
                <span v-if="action.reason">{{ action.reason }}</span>
                <ul v-if="action.payments.length" class="activity-payment-history">
                  <li v-for="payment in action.payments" :key="payment.id">
                    <div>
                      <strong
                        >{{ payment.kind === 'DEPOSIT' ? 'Abono' : 'Reembolso' }} ·
                        {{ payment.accountName }}</strong
                      >
                      <span
                        >{{ formatMoney(payment.amountOriginal, payment.currencyCode)
                        }}<template v-if="payment.currencyCode !== 'USD'">
                          · 1 USD equivale a
                          {{ formatMoney(payment.unitsPerUsd, payment.currencyCode) }}</template
                        ></span
                      >
                      <span v-if="payment.reference">Referencia {{ payment.reference }}</span>
                    </div>
                    <strong>{{ formatMoney(payment.amountUsd, 'USD') }}</strong>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </AppShell>
</template>
