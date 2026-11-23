<script setup lang="ts">
import { ref, watch } from 'vue';
const props = defineProps<{ name?: string; logoUrl?: string | null }>();
const unavailable = ref(false);
watch(
  () => props.logoUrl,
  () => {
    unavailable.value = false;
  },
);
</script>

<template>
  <div class="brand-lockup">
    <img
      v-if="logoUrl && !unavailable"
      :src="logoUrl"
      class="shop-logo"
      alt=""
      referrerpolicy="no-referrer"
      @error="unavailable = true"
    />
    <span v-else class="brand-mark" aria-hidden="true">M</span>
    <span v-if="name && name !== 'MAX Sport Manager'" class="brand-wordmark brand-shop-name">{{
      name
    }}</span>
    <span v-else class="brand-wordmark">
      <strong>MAX</strong>
      <span>Sport Manager</span>
    </span>
  </div>
</template>
