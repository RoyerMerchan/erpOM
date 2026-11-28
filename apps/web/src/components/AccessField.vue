<script setup lang="ts">
import InputText from 'primevue/inputtext';

defineProps<{
  id: string;
  label: string;
  icon: string;
  placeholder: string;
  autocomplete: string;
  type?: 'text' | 'password';
  error?: string;
}>();

const value = defineModel<string>({ required: true });
</script>

<template>
  <div class="access-field">
    <label :for="id">{{ label }}</label>
    <div class="access-field-control" :class="{ 'access-field-with-action': $slots.action }">
      <i class="pi access-field-icon" :class="icon" aria-hidden="true"></i>
      <InputText
        :id="id"
        v-model="value"
        :name="id"
        :type="type ?? 'text'"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        autocapitalize="none"
        spellcheck="false"
        required
        fluid
        :invalid="Boolean(error)"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? id + '-error' : undefined"
      />
      <div v-if="$slots.action" class="access-field-action">
        <slot name="action" />
      </div>
    </div>
    <p v-if="error" :id="id + '-error'" class="access-field-error">
      <i class="pi pi-exclamation-circle" aria-hidden="true"></i> {{ error }}
    </p>
  </div>
</template>

<style scoped>
.access-field {
  display: grid;
  min-width: 0;
  gap: 0.45rem;
}

.access-field label {
  color: var(--access-text, CanvasText);
  font-size: 0.875rem;
  font-weight: 600;
}

.access-field-control {
  position: relative;
}

.access-field-icon,
.access-field-action {
  position: absolute;
  inset-block-start: 50%;
  transform: translateY(-50%);
}

.access-field-icon {
  z-index: 1;
  inset-inline-start: 1rem;
  color: var(--access-icon, GrayText);
  font-size: 1.25rem;
  pointer-events: none;
  transition: color 180ms ease;
}

.access-field-control:focus-within .access-field-icon {
  color: var(--access-accent, LinkText);
}

.access-field-action {
  inset-inline-end: 0.4rem;
}

.access-field-control .p-inputtext {
  width: 100%;
  min-height: 3.5rem;
  padding-inline: 3rem 1rem;
  border: 1px solid var(--access-input-border, GrayText);
  border-radius: 0.75rem;
  background: var(--access-input-surface, Canvas);
  color: var(--access-text, CanvasText);
  font-size: 1rem;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.access-field-with-action .p-inputtext {
  padding-inline-end: 3.4rem;
}

.access-field-with-action .p-inputtext::-ms-reveal {
  display: none;
}

.access-field-control .p-inputtext::placeholder {
  color: var(--access-muted, GrayText);
  opacity: 1;
}

.access-field-control .p-inputtext:autofill {
  box-shadow: 0 0 0 4rem var(--access-input-surface, Canvas) inset;
  -webkit-text-fill-color: var(--access-text, CanvasText);
}

.access-field-control .p-inputtext:not(.p-invalid):hover {
  border-color: var(--access-icon, GrayText);
}

.access-field-control .p-inputtext:focus {
  border-color: var(--access-accent, LinkText);
  outline: 2px solid color-mix(in srgb, var(--access-accent, LinkText) 36%, transparent);
  outline-offset: 2px;
}

.access-field-control .p-inputtext.p-invalid {
  border-color: var(--access-error, #f87171);
}

.access-field-error {
  margin: 0;
  color: var(--access-error, #f87171);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.access-field-error i {
  margin-inline-end: 0.2rem;
}

@media (prefers-reduced-motion: reduce) {
  .access-field-icon,
  .access-field-control .p-inputtext {
    transition: none;
  }
}
</style>
