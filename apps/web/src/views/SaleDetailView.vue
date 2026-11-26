<script setup lang="ts">
import type { SaleDetail } from '@max-sport/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import { correctionLabel } from '../after-sale/form';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { timeLabel } from '../master-data/field-types';
import { failureMessage, formatMoney } from '../purchasing/form';
import { getSale } from '../sales/service';
import { useSessionStore } from '../stores/session';

const props = defineProps<{ id: string }>();
const session = useSessionStore();
const sale = ref<SaleDetail>();
const error = ref('');
const tenderLabels: Record<SaleDetail['tenders'][number]['kind'], string> = {
  PAYMENT: 'Cobro',
  CHANGE: 'Vuelto',
  ADVANCE: 'Anticipo aplicado',
};

async function load() {
  error.value = '';
  try {
    sale.value = await getSale(props.id);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo cargar la venta.');
  }
}

function description(discount: SaleDetail['discounts'][number]) {
  if (discount.kind === 'PERCENT') return formatMoney(discount.percentage) + ' %';
  return (
    formatMoney(discount.amountOriginal, discount.currencyCode ?? '') +
    (discount.currencyCode === 'USD'
      ? ''
      : ' · 1 USD equivale a ' + formatMoney(discount.unitsPerUsd, discount.currencyCode ?? ''))
  );
}

function printReceipt() {
  window.print();
}

function downloadReceipt() {
  const record = sale.value;
  if (!record) return;
  const lines = [
    record.shopName,
    'Comprobante ' + record.receiptNumber,
    timeLabel(record.confirmedAt),
    'Cliente · ' + record.customerName,
    'Vendedor · ' + record.sellerName,
    '',
    ...record.items.map(
      (line) =>
        line.quantity +
        ' × ' +
        line.brandName +
        ' ' +
        line.modelName +
        ' · Talla ' +
        line.size +
        ' · ' +
        line.sku +
        ' · ' +
        formatMoney(line.netUsd, 'USD'),
    ),
    '',
    'Subtotal · ' + formatMoney(record.subtotalUsd, 'USD'),
    'Descuentos · ' + formatMoney(record.discountUsd, 'USD'),
    'Total · ' + formatMoney(record.totalUsd, 'USD'),
    ...(record.exchangeCreditUsd !== null
      ? ['Crédito por cambio · ' + formatMoney(record.exchangeCreditUsd, 'USD')]
      : []),
    ...record.tenders.map(
      (line) =>
        tenderLabels[line.kind] + ' · ' + formatMoney(line.amountOriginal, line.currencyCode),
    ),
  ];
  const url = URL.createObjectURL(
    new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' }),
  );
  const download = document.createElement('a');
  download.href = url;
  download.download = record.receiptNumber + '.txt';
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

onMounted(() => void load());
</script>

<template>
  <AppShell>
    <div class="sale-screen-only">
      <SectionLinks />
      <header class="module-heading">
        <div>
          <RouterLink class="inline-action" :to="{ name: 'sales' }">Volver al historial</RouterLink>
          <PageHeading :title="sale ? 'Venta ' + sale.receiptNumber : 'Detalle de venta'" />
        </div>
        <div v-if="sale" class="sale-actions">
          <Button
            label="Descargar"
            icon="pi pi-download"
            variant="outlined"
            @click="downloadReceipt"
          />
          <Button label="Imprimir" icon="pi pi-print" @click="printReceipt" />
        </div>
      </header>
      <Message v-if="error" severity="error">
        {{ error }} <button type="button" class="inline-action" @click="load">Reintentar</button>
      </Message>
      <p v-else-if="!sale" class="sale-muted" role="status">Cargando comprobante…</p>
    </div>

    <div v-if="sale" class="sale-detail-layout">
      <article class="sale-panel sale-receipt" aria-labelledby="sale-receipt">
        <header class="sale-receipt-header">
          <h2 id="sale-receipt">{{ sale.shopName }}</h2>
          <strong>Comprobante {{ sale.receiptNumber }}</strong>
          <time :datetime="sale.confirmedAt">{{ timeLabel(sale.confirmedAt) }}</time>
        </header>
        <dl class="sale-meta">
          <div>
            <dt>Cliente</dt>
            <dd>{{ sale.customerName }}</dd>
          </div>
          <div>
            <dt>Vendedor</dt>
            <dd>{{ sale.sellerName }}</dd>
          </div>
        </dl>
        <ul class="sale-receipt-items" aria-label="Productos de la venta">
          <li v-for="line in sale.items" :key="line.id">
            <div>
              <strong>{{ line.brandName }} {{ line.modelName }}</strong>
              <span
                >Talla {{ line.size }}<template v-if="line.color"> · {{ line.color }}</template> ·
                {{ line.sku }}</span
              >
              <span>{{ line.quantity }} × {{ formatMoney(line.unitPriceUsd, 'USD') }}</span>
            </div>
            <strong>{{ formatMoney(line.netUsd, 'USD') }}</strong>
          </li>
        </ul>
        <div class="sale-totals">
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{{ formatMoney(sale.subtotalUsd, 'USD') }}</dd>
            </div>
            <div>
              <dt>Descuentos</dt>
              <dd>{{ formatMoney(sale.discountUsd, 'USD') }}</dd>
            </div>
            <div class="sale-total">
              <dt>Total</dt>
              <dd>{{ formatMoney(sale.totalUsd, 'USD') }}</dd>
            </div>
            <div v-if="sale.exchangeCreditUsd !== null">
              <dt>Crédito por cambio</dt>
              <dd>{{ formatMoney(sale.exchangeCreditUsd, 'USD') }}</dd>
            </div>
            <div v-for="(tender, index) in sale.tenders" :key="index">
              <dt>{{ tenderLabels[tender.kind] }} en {{ tender.currencyCode }}</dt>
              <dd>{{ formatMoney(tender.amountOriginal, tender.currencyCode) }}</dd>
            </div>
          </dl>
        </div>
      </article>

      <div class="sale-detail-aside sale-screen-only">
        <section
          v-if="
            sale.corrections.length ||
            sale.layawayId ||
            sale.exchangeId ||
            (session.can('returns.create') &&
              sale.items.some((line) => (line.returnableQuantity ?? line.quantity) > 0))
          "
          class="sale-panel activity-stack"
          aria-labelledby="sale-related"
        >
          <h2 id="sale-related">Operaciones relacionadas</h2>
          <RouterLink
            v-if="sale.layawayId && session.can('layaways.read')"
            class="inline-action"
            :to="{ name: 'layaway-detail', params: { id: sale.layawayId } }"
            >Ver apartado</RouterLink
          >
          <RouterLink
            v-if="sale.exchangeId && session.can('returns.read')"
            class="inline-action"
            :to="{ name: 'return-detail', params: { id: sale.exchangeId } }"
            >Ver cambio que originó esta venta</RouterLink
          >
          <ul v-if="sale.corrections.length" class="sale-detail-list">
            <li v-for="correction in sale.corrections" :key="correction.id">
              <RouterLink
                v-if="session.can('returns.read')"
                class="inline-action"
                :to="{ name: 'return-detail', params: { id: correction.id } }"
              >
                {{ correctionLabel(correction.kind) }} {{ correction.number }}
              </RouterLink>
              <strong v-else>{{ correctionLabel(correction.kind) }} {{ correction.number }}</strong>
              <strong>{{ formatMoney(correction.returnedUsd, 'USD') }}</strong>
            </li>
          </ul>
          <dl v-if="sale.adjustedTotalUsd !== undefined" class="activity-summary">
            <div>
              <dt>Venta neta ajustada</dt>
              <dd>{{ formatMoney(sale.adjustedTotalUsd, 'USD') }}</dd>
            </div>
            <div v-if="sale.adjustedCogsUsd !== undefined">
              <dt>Costo ajustado</dt>
              <dd>{{ formatMoney(sale.adjustedCogsUsd, 'USD') }}</dd>
            </div>
            <div v-if="sale.adjustedProfitUsd !== undefined">
              <dt>Utilidad ajustada</dt>
              <dd>{{ formatMoney(sale.adjustedProfitUsd, 'USD') }}</dd>
            </div>
          </dl>
          <RouterLink
            v-if="
              session.can('returns.create') &&
              sale.items.some((line) => (line.returnableQuantity ?? line.quantity) > 0)
            "
            class="p-button p-component p-button-outlined activity-fit"
            :to="{ name: 'return-new', params: { saleId: sale.id } }"
            ><i class="pi pi-replay" aria-hidden="true" /> Cambio o devolución</RouterLink
          >
        </section>
        <section class="sale-panel" aria-labelledby="sale-payment-detail">
          <h2 id="sale-payment-detail">Movimientos por cuenta</h2>
          <p v-if="!sale.tenders.length" class="sale-muted">
            {{
              sale.exchangeCreditUsd !== null
                ? 'El crédito cubrió el importe del reemplazo.'
                : 'El total de esta venta fue cero.'
            }}
          </p>
          <ul v-else class="sale-detail-list">
            <li v-for="(tender, index) in sale.tenders" :key="index">
              <div>
                <strong>{{ tenderLabels[tender.kind] }} · {{ tender.accountName }}</strong>
                <span v-if="tender.currencyCode !== 'USD'"
                  >1 USD equivale a {{ formatMoney(tender.unitsPerUsd, tender.currencyCode) }}</span
                >
                <span v-if="tender.reference">Referencia {{ tender.reference }}</span>
              </div>
              <strong>{{ formatMoney(tender.amountUsd, 'USD') }}</strong>
            </li>
          </ul>
        </section>
        <section
          v-if="sale.discounts.length"
          class="sale-panel"
          aria-labelledby="sale-discount-detail"
        >
          <h2 id="sale-discount-detail">Descuentos aplicados</h2>
          <ul class="sale-detail-list">
            <li v-for="(discount, index) in sale.discounts" :key="index">
              <div>
                <strong>{{
                  discount.saleItemId
                    ? sale.items.find(({ id }) => id === discount.saleItemId)?.sku
                    : 'Toda la venta'
                }}</strong>
                <span>{{ description(discount) }}</span>
              </div>
              <strong>{{ formatMoney(discount.amountUsd, 'USD') }}</strong>
            </li>
          </ul>
        </section>
        <section
          v-if="sale.cogsUsd !== undefined"
          class="sale-panel"
          aria-labelledby="sale-profit-detail"
        >
          <h2 id="sale-profit-detail">Rentabilidad</h2>
          <div class="sale-totals">
            <dl>
              <div>
                <dt>Costo FIFO</dt>
                <dd>{{ formatMoney(sale.cogsUsd, 'USD') }}</dd>
              </div>
              <div v-if="sale.grossProfitUsd !== undefined">
                <dt>Utilidad bruta</dt>
                <dd>{{ formatMoney(sale.grossProfitUsd, 'USD') }}</dd>
              </div>
            </dl>
          </div>
          <ul class="sale-detail-list">
            <li v-for="line in sale.items" :key="line.id">
              <span
                >{{ line.sku }} · {{ line.quantity }}
                {{ line.quantity === 1 ? 'par' : 'pares' }}</span
              >
              <strong>{{ formatMoney(line.cogsUsd, 'USD') }}</strong>
            </li>
          </ul>
        </section>
        <section v-if="sale.notes" class="sale-panel" aria-labelledby="sale-notes-detail">
          <h2 id="sale-notes-detail">Notas internas</h2>
          <p class="sale-notes">{{ sale.notes }}</p>
        </section>
      </div>
    </div>
  </AppShell>
</template>
