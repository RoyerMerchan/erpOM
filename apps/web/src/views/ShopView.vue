<script setup lang="ts">
import { layawayRefundLabels, shopInput } from '@max-sport/shared';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import { onMounted, ref } from 'vue';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import PageHeading from '../components/PageHeading.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { formPayload } from '../master-data/field-types';
import type { Field, FormValues } from '../master-data/field-types';
import RecordFields from '../master-data/RecordFields.vue';
import { getShop, putShop } from '../master-data/service';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const toast = useToast();
const fields: Field[] = [
  { key: 'name', label: 'Nombre de la tienda', required: true, max: 160 },
  {
    key: 'timezone',
    label: 'Zona horaria',
    required: true,
    max: 80,
    help: 'Ejemplo America/Caracas',
  },
  { key: 'logoUrl', label: 'URL del logotipo', nullable: true, max: 2048 },
  {
    key: 'layawayRefundPolicy',
    label: 'Al cancelar o cerrar un apartado',
    kind: 'select',
    options: Object.entries(layawayRefundLabels).map(([value, label]) => ({ value, label })),
    required: true,
    help: 'La política se aplica a los apartados que se creen después de guardarla.',
  },
  {
    key: 'lowStockThreshold',
    label: 'Umbral general de stock bajo',
    kind: 'number',
    min: 0,
    required: true,
  },
];
const draft = ref<FormValues>({});
const errors = ref<Record<string, string>>({});
const loadError = ref('');
const saveError = ref('');
const loading = ref(true);
const saving = ref(false);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    draft.value = await getShop();
  } catch (error) {
    loadError.value =
      error instanceof ApiRequestError ? error.message : 'No se pudo cargar la tienda.';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (saving.value || !session.can('shop.update')) return;
  errors.value = {};
  saveError.value = '';
  const parsed = shopInput.safeParse(formPayload(fields, draft.value));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (typeof issue.path[0] === 'string') errors.value[issue.path[0]] ??= issue.message;
    }
    return;
  }
  saving.value = true;
  try {
    const updated = await putShop(parsed.data);
    draft.value = updated;
    session.shop = updated;
    toast.add({ severity: 'success', summary: 'Configuración guardada', life: 3500 });
  } catch (error) {
    saveError.value =
      error instanceof ApiRequestError ? error.message : 'No se pudo guardar la configuración.';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading"><PageHeading title="Configuración de tienda" /></header>
    <section class="records-panel settings-card" aria-label="Datos de la tienda">
      <p v-if="loading" class="records-empty" role="status">Cargando configuración…</p>
      <Message v-else-if="loadError" severity="error">
        {{ loadError }}
        <button type="button" class="inline-action" @click="load">Reintentar</button>
      </Message>
      <form v-else class="record-form" novalidate @submit.prevent="submit">
        <RecordFields
          v-model="draft"
          :fields="fields"
          :errors="errors"
          :disabled="saving || !session.can('shop.update')"
          prefix="shop"
        />
        <Message v-if="saveError" severity="error">{{ saveError }}</Message>
        <div v-if="session.can('shop.update')" class="record-form-actions">
          <Button
            type="submit"
            label="Guardar configuración"
            :loading="saving"
            :disabled="saving"
          />
        </div>
      </form>
    </section>
  </AppShell>
</template>
