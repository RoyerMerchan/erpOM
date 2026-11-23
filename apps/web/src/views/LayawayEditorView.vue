<script setup lang="ts">
import { createLayawayInput } from '@max-sport/shared';
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
import AppShell from '../components/AppShell.vue';
import { browserTimeZone } from '../master-data/field-types';
import type { FieldValue } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { asDate, failureMessage, operationKey } from '../purchasing/form';
import type { TenderDraft } from '../sales/form';

const router = useRouter();
const customerId = ref<FieldValue>(null);
const expires = ref('');
const notes = ref('');
const cart = ref<StockSelection[]>([]);
const payments = ref<TenderDraft[]>([]);
const posting = ref(false);
const error = ref('');
const idFor = operationKey();

async function reserve() {
  if (posting.value) return;
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
  posting.value = true;
  error.value = '';
  try {
    const record = await createLayaway(input.data);
    await router.replace({ name: 'layaway-detail', params: { id: record.id } });
  } catch (failure) {
    error.value = failureMessage(
      failure,
      'No se pudo comprobar el apartado. Reintenta con los mismos datos.',
    );
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
        <h1>Nuevo apartado</h1>
      </div>
    </header>
    <div class="pos-layout" :inert="posting" :aria-busy="posting">
      <StockCart v-model="cart" heading="Tallas para reservar" />
      <section class="sale-panel activity-stack" aria-labelledby="layaway-details">
        <h2 id="layaway-details">Datos del apartado</h2>
        <form class="activity-stack" @submit.prevent="reserve">
          <div class="field">
            <label for="layaway-customer">Cliente</label>
            <LookupSelect
              id="layaway-customer"
              v-model="customerId"
              resource="customers"
              clearable
            />
          </div>
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
          <h3>Anticipo inicial</h3>
          <TenderList v-model="payments" label="Abono" />
          <Message v-if="error" severity="error">{{ error }}</Message>
          <Button type="submit" label="Reservar tallas" icon="pi pi-bookmark" :loading="posting" />
        </form>
      </section>
    </div>
  </AppShell>
</template>
