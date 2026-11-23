<script setup lang="ts">
import { currencyInput, currencyRecord } from '@max-sport/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { computed, onMounted, ref } from 'vue';
import type { z } from 'zod';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import type { Field, FormValues } from '../master-data/field-types';
import RecordFields from '../master-data/RecordFields.vue';
import { getCurrencies, putCurrency } from '../master-data/service';
import { useSessionStore } from '../stores/session';

type Currency = z.output<typeof currencyRecord>;
const session = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const currencies = ref<Currency[]>([]);
const loading = ref(true);
const error = ref('');
const formError = ref('');
const editing = ref<Currency>();
const formVisible = ref(false);
const saving = ref(false);
const draft = ref<FormValues>({});
const fields = computed<Field[]>(() => [
  { key: 'name', label: 'Nombre', required: true, max: 80 },
  {
    key: 'minorUnits',
    label: 'Decimales operativos',
    kind: 'number',
    required: true,
    min: 0,
    max: 8,
    disabled: editing.value?.code === 'USD',
  },
  { key: 'active', label: 'Habilitada', kind: 'boolean', disabled: editing.value?.code === 'USD' },
]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    currencies.value = await getCurrencies();
  } catch (failure) {
    error.value =
      failure instanceof ApiRequestError ? failure.message : 'No se pudieron cargar las monedas.';
  } finally {
    loading.value = false;
  }
}

function open(currency: Currency) {
  editing.value = currency;
  draft.value = { name: currency.name, minorUnits: currency.minorUnits, active: currency.active };
  formError.value = '';
  formVisible.value = true;
}

async function save(code: string, input: z.output<typeof currencyInput>) {
  if (saving.value) return;
  saving.value = true;
  try {
    const updated = await putCurrency(code, input);
    currencies.value = currencies.value.map((item) => (item.code === code ? updated : item));
    formVisible.value = false;
    toast.add({ severity: 'success', summary: 'Moneda guardada', life: 3500 });
  } catch (failure) {
    formError.value =
      failure instanceof ApiRequestError ? failure.message : 'No se pudo guardar la moneda.';
  } finally {
    saving.value = false;
  }
}

function submit() {
  const currency = editing.value;
  if (!currency) return;
  formError.value = '';
  const parsed = currencyInput.safeParse(draft.value);
  if (!parsed.success) {
    formError.value = parsed.error.issues[0]?.message ?? 'Revisa los datos.';
    return;
  }
  if (currency.active && !parsed.data.active) {
    confirm.require({
      header: 'Deshabilitar ' + currency.code,
      message: 'Las tasas y cuentas existentes seguirán disponibles en el historial.',
      acceptProps: { label: 'Deshabilitar', severity: 'danger' },
      rejectProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      accept: () => void save(currency.code, parsed.data),
    });
    return;
  }
  void save(currency.code, parsed.data);
}

onMounted(load);
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading"><h1>Monedas</h1></header>
    <p v-if="loading" class="records-empty" role="status">Cargando monedas…</p>
    <Message v-else-if="error" severity="error"
      >{{ error }}
      <button type="button" class="inline-action" @click="load">Reintentar</button></Message
    >
    <p v-else-if="!currencies.length" class="records-empty">No hay monedas configuradas.</p>
    <section v-else class="currency-grid" aria-label="Monedas configuradas">
      <article
        v-for="currency in currencies"
        :key="currency.code"
        class="records-panel currency-card"
      >
        <div class="currency-card-heading">
          <h2>{{ currency.code }}</h2>
          <Tag v-if="currency.code === 'USD'" value="Moneda base" severity="info" />
        </div>
        <p>{{ currency.name }}</p>
        <dl class="record-detail">
          <div>
            <dt>Estado</dt>
            <dd>{{ currency.active ? 'Habilitada' : 'Inactiva' }}</dd>
          </div>
          <div>
            <dt>Decimales operativos</dt>
            <dd>{{ currency.minorUnits }}</dd>
          </div>
        </dl>
        <Button
          v-if="session.can('currencies.update')"
          text
          label="Editar"
          @click="open(currency)"
        />
      </article>
    </section>
    <Dialog
      v-model:visible="formVisible"
      :header="'Editar ' + (editing?.code ?? '')"
      modal
      :draggable="false"
      :closable="!saving"
      :close-on-escape="!saving"
      class="record-dialog"
    >
      <form class="record-form" novalidate @submit.prevent="submit">
        <RecordFields v-model="draft" :fields="fields" :disabled="saving" prefix="currency" />
        <Message v-if="formError" severity="error">{{ formError }}</Message>
        <div class="record-form-actions">
          <Button
            label="Cancelar"
            severity="secondary"
            outlined
            :disabled="saving"
            @click="formVisible = false"
          />
          <Button label="Guardar" type="submit" :disabled="saving" :loading="saving" />
        </div>
      </form>
    </Dialog>
  </AppShell>
</template>
