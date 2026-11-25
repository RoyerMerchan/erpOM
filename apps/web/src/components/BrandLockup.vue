<script setup lang="ts">
import { computed, ref, watch } from 'vue';
const props = defineProps<{ name?: string; logoUrl?: string | null }>();
const defaultLogo = `${import.meta.env.BASE_URL}om-erp-favicon.png`;
const shopName = computed(() => {
  const name = props.name?.trim();
  return name && name !== 'MAX Sport Manager' && name !== 'OM ERP' ? name : '';
});
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
      :src="logoUrl && !unavailable ? logoUrl : defaultLogo"
      class="brand-emblem"
      :class="{ 'brand-emblem-custom': logoUrl && !unavailable }"
      alt=""
      referrerpolicy="no-referrer"
      @error="unavailable = true"
    />
    <span class="brand-wordmark">
      <strong>OM ERP</strong>
      <span v-if="shopName" class="brand-shop-name" :title="shopName">{{ shopName }}</span>
    </span>
  </div>
</template>
