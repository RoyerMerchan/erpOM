<script setup lang="ts">
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import type { Field, FormValues } from './field-types';
import LookupSelect from './LookupSelect.vue';

const props = defineProps<{
  fields: Field[];
  prefix: string;
  errors?: Record<string, string>;
  disabled?: boolean;
}>();
const draft = defineModel<FormValues>({ required: true });
const id = (key: string) => props.prefix + '-' + key;
const describedBy = (field: Field) =>
  props.errors?.[field.key] || field.help ? id(field.key) + '-hint' : undefined;
function textValue(key: string) {
  const value = draft.value[key];
  return typeof value === 'string' ? value : '';
}
function numberValue(key: string) {
  const value = draft.value[key];
  return typeof value === 'number' ? value : null;
}
</script>

<template>
  <div class="record-fields">
    <div
      v-for="field in fields"
      :key="field.key"
      class="record-field"
      :class="{ 'record-field-wide': field.kind === 'textarea' }"
    >
      <label :for="id(field.key)">{{ field.label }}</label>
      <LookupSelect
        v-if="field.lookup"
        :id="id(field.key)"
        v-model="draft[field.key]"
        :resource="field.lookup"
        :disabled="disabled || field.disabled"
        :invalid="Boolean(errors?.[field.key])"
        :described-by="describedBy(field)"
      />
      <Select
        v-else-if="field.kind === 'select'"
        v-model="draft[field.key]"
        :input-id="id(field.key)"
        :options="field.options"
        :disabled="disabled || field.disabled"
        :invalid="Boolean(errors?.[field.key])"
        :aria-describedby="describedBy(field)"
        option-label="label"
        option-value="value"
        placeholder="Selecciona una opción"
        fluid
      />
      <InputNumber
        v-else-if="field.kind === 'number'"
        :input-id="id(field.key)"
        :model-value="numberValue(field.key)"
        :min="field.min"
        :max="field.max"
        :use-grouping="false"
        :max-fraction-digits="0"
        :disabled="disabled || field.disabled"
        :invalid="Boolean(errors?.[field.key])"
        :aria-describedby="describedBy(field)"
        fluid
        @update:model-value="draft[field.key] = $event ?? null"
      />
      <Checkbox
        v-else-if="field.kind === 'boolean'"
        v-model="draft[field.key]"
        :input-id="id(field.key)"
        :disabled="disabled || field.disabled"
        :aria-describedby="describedBy(field)"
        binary
      />
      <Password
        v-else-if="field.kind === 'password'"
        :input-id="id(field.key)"
        :model-value="textValue(field.key)"
        :autocomplete="field.autocomplete"
        :disabled="disabled || field.disabled"
        :invalid="Boolean(errors?.[field.key])"
        :input-props="{
          maxlength: field.max,
          'aria-describedby': describedBy(field),
          'aria-required': field.required,
        }"
        :feedback="false"
        toggle-mask
        fluid
        @update:model-value="draft[field.key] = $event ?? ''"
      />
      <Textarea
        v-else-if="field.kind === 'textarea'"
        :id="id(field.key)"
        :model-value="textValue(field.key)"
        :maxlength="field.max"
        :disabled="disabled || field.disabled"
        :invalid="Boolean(errors?.[field.key])"
        :aria-describedby="describedBy(field)"
        rows="3"
        fluid
        @update:model-value="draft[field.key] = $event ?? ''"
      />
      <InputText
        v-else
        :id="id(field.key)"
        :model-value="textValue(field.key)"
        :maxlength="field.max"
        :type="field.kind === 'date' ? 'datetime-local' : 'text'"
        :step="field.kind === 'date' ? '1' : undefined"
        :inputmode="field.numericText ? 'decimal' : undefined"
        :aria-required="field.required"
        :disabled="disabled || field.disabled"
        :invalid="Boolean(errors?.[field.key])"
        :aria-describedby="describedBy(field)"
        fluid
        @update:model-value="draft[field.key] = $event ?? ''"
      />
      <p v-if="errors?.[field.key]" :id="id(field.key) + '-hint'" class="field-error">
        {{ errors[field.key] }}
      </p>
      <p v-else-if="field.help" :id="id(field.key) + '-hint'" class="record-hint">
        {{ field.help }}
      </p>
    </div>
  </div>
</template>
