<script setup lang="ts">
import { createLayawayInput } from '@max-sport/shared';
import type { CreateLayawayInput } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Textarea from 'primevue/textarea';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { cartInput, paymentInputs } from '../after-sale/form';
import type { StockSelection } from '../after-sale/form';
import { createLayaway } from '../after-sale/service';
import StockCart from '../after-sale/StockCart.vue';
import TenderList from '../after-sale/TenderList.vue';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import { browserTimeZone } from '../master-data/field-types';
import type { FieldValue } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { asDate, operationKey } from '../purchasing/form';
import type { TenderDraft } from '../sales/form';

const router = useRouter();
const customerId = ref<FieldValue>(null);
const expires = ref('');
const notes = ref('');
const cart = ref<StockSelection[]>([]);
const payments = ref<TenderDraft[]>([]);
const posting = ref(false);
const attempt = ref<CreateLayawayInput>();
const error = ref('');
const idFor = operationKey();

async function reserve() {
  if (posting.value) return;
  if (!attempt.value) {
    const body = {
      customerId: customerId.value,
      expiresAt: expires.value ? asDate(expires.value) : null,
      notes: notes.value,
      items: cartInput(cart.value),
      payments: paymentInputs(payments.value),
    };
    const input = createLayawayInput.safeParse({ ...body, operationId: idFor(body) });
    if (!input.success) {
      error.value = input.error.issues[0]?.message ?? 'Revisa los datos del apartado.';
      return;
    }
    attempt.value = input.data;
  }
  posting.value = true;
  error.value = '';
  try {
    const record = await createLayaway(attempt.value);
    await router.replace({ name: 'layaway-detail', params: { id: record.id } });
  } catch (failure) {
    if (
      failure instanceof ApiRequestError &&
      failure.status &&
      failure.status >= 400 &&
      failure.status < 500
    ) {
      attempt.value = undefined;
      error.value = failure.message;
    } else {
      error.value =
        'No pudimos comprobar si se guardó. Pulsa Comprobar reserva para consultar el mismo intento.';
    }
  } finally {
    posting.value = false;
  }
}
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <div>
        <RouterLink :to="{ name: 'layaways' }" class="inline-action">Volver a apartados</RouterLink>
        <PageHeading title="Nuevo apartado" />
        <p>Elige cliente y tallas. Los pares se reservan y la venta se registra al entregar.</p>
      </div>
    </header>
    <div class="pos-layout" :inert="posting" :aria-busy="posting">
      <StockCart v-model="cart" heading="Tallas para reservar" :inert="!!attempt" />
      <section class="sale-panel activity-stack" aria-labelledby="layaway-details">
        <h2 id="layaway-details">Datos del apartado</h2>
        <form class="activity-stack" @submit.prevent="reserve">
          <div class="activity-stack" :inert="!!attempt">
            <div class="field">
              <label id="layaway-customer-label" for="layaway-customer">Cliente</label>
              <LookupSelect
                id="layaway-customer"
                labelled-by="layaway-customer-label"
                v-model="customerId"
                resource="customers"
                clearable
              />
            </div>
            <details class="pos-section">
              <summary>Fecha límite y notas</summary>
              <div class="field">
                <label for="layaway-expiry">Vencimiento opcional</label>
                <InputText
                  id="layaway-expiry"
                  v-model="expires"
                  type="datetime-local"
                  aria-describedby="layaway-tz"
                  fluid
                />
                <small id="layaway-tz" class="sale-muted">{{ browserTimeZone }}</small>
              </div>
              <div class="field">
                <label for="layaway-note">Notas</label>
                <Textarea id="layaway-note" v-model="notes" rows="2" maxlength="2000" fluid />
              </div>
            </details>
            <h3>Anticipo inicial (opcional)</h3>
            <TenderList v-model="payments" label="Abono" />
          </div>
          <Message v-if="error" severity="error">{{ error }}</Message>
          <Button
            type="submit"
            :label="attempt && !posting ? 'Comprobar reserva' : 'Reservar tallas'"
            icon="pi pi-bookmark"
            :loading="posting"
          />
        </form>
      </section>
    </div>
  </AppShell>
</template>
