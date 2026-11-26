<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';

const props = defineProps<{ topic: string; text: string }>();
const id = useId();
const trigger = ref<HTMLButtonElement>();
const tooltip = ref<HTMLSpanElement>();
const hovered = ref(false);
const focused = ref(false);
const pinned = ref(false);
const open = computed(() => hovered.value || focused.value || pinned.value);
const position = ref({ top: '0px', left: '0px' });
let leaveTimer: number | undefined;

function pointAt(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  window.clearTimeout(leaveTimer);
  hovered.value = true;
}

function pointAway(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  window.clearTimeout(leaveTimer);
  // Allow the pointer to cross the gap between the button and the tooltip.
  leaveTimer = window.setTimeout(() => (hovered.value = false), 180);
}

function dismiss() {
  window.clearTimeout(leaveTimer);
  hovered.value = false;
  focused.value = false;
  pinned.value = false;
}

function toggle() {
  if (pinned.value) dismiss();
  else pinned.value = true;
}

function releaseFocus() {
  focused.value = false;
  pinned.value = false;
}

function positionTooltip() {
  if (!trigger.value || !tooltip.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const { width, height } = tooltip.value.getBoundingClientRect();
  const viewport = document.documentElement;
  const margin = 12;
  const gap = 6;
  const centered = anchor.left + (anchor.width - width) / 2;
  const left = Math.max(margin, Math.min(centered, viewport.clientWidth - width - margin));
  const below = anchor.bottom + gap;
  const top =
    below + height <= viewport.clientHeight - margin
      ? below
      : Math.max(margin, anchor.top - height - gap);
  position.value = { top: `${top}px`, left: `${left}px` };
}

function dismissOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') dismiss();
}

function dismissFromOutside(event: PointerEvent) {
  if (!(event.target instanceof Node)) return;
  if (!trigger.value?.contains(event.target) && !tooltip.value?.contains(event.target)) dismiss();
}

watch(
  [open, () => props.text],
  ([visible], _oldValue, onCleanup) => {
    if (!visible) return;
    positionTooltip();
    document.addEventListener('keydown', dismissOnEscape);
    document.addEventListener('pointerdown', dismissFromOutside, true);
    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', dismiss, true);
    onCleanup(() => {
      document.removeEventListener('keydown', dismissOnEscape);
      document.removeEventListener('pointerdown', dismissFromOutside, true);
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', dismiss, true);
    });
  },
  { flush: 'post' },
);

onBeforeUnmount(() => window.clearTimeout(leaveTimer));
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="context-help-trigger"
    :aria-label="'Ayuda sobre ' + topic"
    :aria-describedby="id"
    :aria-expanded="open"
    @pointerenter="pointAt"
    @pointerleave="pointAway"
    @focus="focused = !!trigger?.matches(':focus-visible')"
    @blur="releaseFocus"
    @click="toggle"
  >
    <span class="pi pi-info-circle" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <span
      :id="id"
      ref="tooltip"
      role="tooltip"
      class="context-help-tooltip"
      :class="{ 'context-help-tooltip-open': open }"
      :style="position"
      @pointerenter="pointAt"
      @pointerleave="pointAway"
    >
      {{ text }}
    </span>
  </Teleport>
</template>

<style scoped>
.context-help-trigger {
  display: grid;
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 50%;
  color: var(--context-help-color, var(--indigo));
}

.context-help-trigger[aria-expanded='true'] {
  background: var(--context-help-highlight, #e5efff);
}

.context-help-trigger:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.context-help-tooltip {
  position: fixed;
  visibility: hidden;
  z-index: 1300;
  display: block;
  width: max-content;
  max-width: min(19.5rem, calc(100vw - 1.5rem));
  padding: 0.65rem 0.85rem;
  border: 1px solid #304766;
  border-radius: 0.65rem;
  background: var(--navy);
  color: #fff;
  box-shadow: 0 0.45rem 1.1rem #10203d2b;
  font-size: 0.85rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.context-help-tooltip-open {
  visibility: visible;
}

@media print {
  .context-help-trigger,
  .context-help-tooltip {
    display: none !important;
  }
}
</style>
