<script setup lang="ts">
import { returnConditionLabels } from '@max-sport/shared';
import type { CorrectionDetail } from '@max-sport/shared';
import Message from 'primevue/message';
import { onMounted, ref } from 'vue';
import { correctionLabel } from '../after-sale/form';
import { getCorrection } from '../after-sale/service';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { timeLabel } from '../master-data/field-types';
import { failureMessage, formatMoney } from '../purchasing/form';

const props = defineProps<{ id: string }>();
const record = ref<CorrectionDetail>();
const error = ref('');
async function load() {
  error.value = '';
  try {
    record.value = await getCorrection(props.id);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo cargar el movimiento.');
  }
}
onMounted(() => void load());
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <div>
        <RouterLink :to="{ name: 'returns' }" class="inline-action"
          >Volver al historial de cambios y devoluciones</RouterLink
        >
        <h1>
          {{
            record ? correctionLabel(record.kind) + ' ' + record.number : 'Detalle del movimiento'
          }}
        </h1>
      </div>
    </header>
    <Message v-if="error" severity="error">
      {{ error }} <button type="button" class="inline-action" @click="load">Reintentar</button>
    </Message>
    <p v-else-if="!record" class="sale-muted" role="status">Cargando movimiento…</p>
    <div v-if="record" class="sale-detail-layout">
      <section class="sale-panel activity-stack" aria-labelledby="correction-items">
        <h2 id="correction-items">Pares devueltos</h2>
        <dl class="sale-meta">
          <div>
            <dt>Venta original</dt>
            <dd>
              <RouterLink
                class="inline-action"
                :to="{ name: 'sale-detail', params: { id: record.originalSaleId } }"
                >{{ record.originalReceipt }}</RouterLink
              >
            </dd>
          </div>
          <div v-if="record.replacementSaleId">
            <dt>Reemplazo</dt>
            <dd>
              <RouterLink
                class="inline-action"
                :to="{ name: 'sale-detail', params: { id: record.replacementSaleId } }"
                >Ver comprobante</RouterLink
              >
            </dd>
          </div>
          <div>
            <dt>Cliente</dt>
            <dd>{{ record.customerName }}</dd>
          </div>
          <div>
            <dt>Autorizó</dt>
            <dd>{{ record.actorName }} · {{ timeLabel(record.createdAt) }}</dd>
          </div>
        </dl>
        <ul class="sale-detail-list">
          <li v-for="line in record.items" :key="line.saleItemId + line.condition">
            <div>
              <strong>{{ line.modelName }} · talla {{ line.size }}</strong>
              <span
                >{{ line.quantity }} × {{ line.sku }} ·
                {{ returnConditionLabels[line.condition] }}</span
              >
            </div>
            <strong>{{ formatMoney(line.creditUsd, 'USD') }}</strong>
          </li>
        </ul>
        <p class="sale-notes"><strong>Motivo</strong> {{ record.reason }}</p>
        <p v-if="record.notes" class="sale-notes">{{ record.notes }}</p>
      </section>
      <section class="sale-panel activity-stack" aria-labelledby="correction-money">
        <h2 id="correction-money">Liquidación</h2>
        <dl class="activity-summary">
          <div>
            <dt>Importe devuelto</dt>
            <dd>{{ formatMoney(record.returnedUsd, 'USD') }}</dd>
          </div>
          <div v-if="record.replacementSaleId">
            <dt>Precio del reemplazo</dt>
            <dd>{{ formatMoney(record.replacementTotalUsd, 'USD') }}</dd>
          </div>
          <div v-if="record.restoredCogsUsd !== undefined">
            <dt>Costo devuelto a inventario</dt>
            <dd>{{ formatMoney(record.restoredCogsUsd, 'USD') }}</dd>
          </div>
          <div>
            <dt>{{ record.differenceUsd.startsWith('-') ? 'Reembolso' : 'Diferencia cobrada' }}</dt>
            <dd>{{ formatMoney(record.differenceUsd.replace(/^-/, ''), 'USD') }}</dd>
          </div>
        </dl>
        <ul v-if="record.tenders.length" class="sale-detail-list">
          <li v-for="(tender, index) in record.tenders" :key="index">
            <div>
              <strong
                >{{ tender.kind === 'REFUND' ? 'Reembolso' : 'Cobro' }} ·
                {{ tender.accountName }}</strong
              >
              <span
                >{{ formatMoney(tender.amountOriginal, tender.currencyCode)
                }}<template v-if="tender.currencyCode !== 'USD'">
                  · 1 USD equivale a
                  {{ formatMoney(tender.unitsPerUsd, tender.currencyCode) }}</template
                ></span
              >
              <span v-if="tender.reference">Referencia {{ tender.reference }}</span>
            </div>
            <strong>{{ formatMoney(tender.amountUsd, 'USD') }}</strong>
          </li>
        </ul>
      </section>
    </div>
  </AppShell>
</template>
