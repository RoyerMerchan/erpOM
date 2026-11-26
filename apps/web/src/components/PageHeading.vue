<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { pageHelp } from '../page-help';
import ContextHelp from './ContextHelp.vue';

const props = defineProps<{ title: string; help?: string; topic?: string }>();
const route = useRoute();
const description = computed(() => props.help ?? pageHelp[route.matched.at(-1)?.path ?? '']);
</script>

<template>
  <div class="page-heading">
    <h1>{{ title }}</h1>
    <ContextHelp v-if="description" :topic="topic ?? title" :text="description" />
  </div>
</template>

<style scoped>
.page-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.4rem;
}

.page-heading h1 {
  min-width: 0;
}
</style>
