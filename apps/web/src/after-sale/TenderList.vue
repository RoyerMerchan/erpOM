<script setup lang="ts">
import Button from 'primevue/button';
import { tenderDraft } from '../sales/form';
import type { TenderDraft } from '../sales/form';
import TenderFields from '../sales/TenderFields.vue';

const props = defineProps<{ label: string }>();
const rows = defineModel<TenderDraft[]>({ required: true });
</script>

<template>
  <div class="activity-stack">
    <div v-for="(row, index) in rows" :key="row.key" class="pos-tender">
      <header class="sale-panel-header">
        <strong>{{ props.label }} {{ index + 1 }}</strong>
        <Button
          type="button"
          icon="pi pi-times"
          variant="text"
          severity="secondary"
          size="small"
          :aria-label="'Quitar ' + props.label.toLowerCase() + ' ' + (index + 1)"
          @click="rows.splice(index, 1)"
        />
      </header>
      <TenderFields v-model="rows[index]!" />
    </div>
    <Button
      type="button"
      icon="pi pi-plus"
      variant="outlined"
      size="small"
      class="activity-fit"
      :label="'Agregar ' + props.label.toLowerCase()"
      :disabled="rows.length >= 20"
      @click="rows.push(tenderDraft())"
    />
  </div>
</template>
