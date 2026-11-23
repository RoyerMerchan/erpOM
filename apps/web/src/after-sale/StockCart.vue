<script setup lang="ts">
import type { InventoryRow } from '@max-sport/shared';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Paginator from 'primevue/paginator';
import { onMounted, ref, useId } from 'vue';
import { usePagedList } from '../master-data/usePagedList';
import { formatMoney } from '../purchasing/form';
import { getInventory } from '../purchasing/service';
import { cartTotal } from './form';
import type { StockSelection } from './form';

defineProps<{ heading: string }>();
const cart = defineModel<StockSelection[]>({ required: true });
const label = useId();
const search = ref('');
const applied = ref('');
const { items, error, limit, total, page, loading, load } = usePagedList(getInventory);
limit.value = 8;
const fetchPage = (next = 1) => load({ stock: 'AVAILABLE', q: applied.value }, next);

function searchItems() {
  applied.value = search.value.trim();
  void fetchPage();
}

function add(row: InventoryRow) {
  const current = cart.value.find((entry) => entry.row.id === row.id);
  if (current) {
    current.quantity = String((Number(current.quantity) || 0) + 1);
    current.row = row;
  } else if (cart.value.length < 100) cart.value.push({ row, quantity: '1' });
}

function isFull(row: InventoryRow) {
  const selected = cart.value.find((entry) => entry.row.id === row.id);
  return selected ? Number(selected.quantity) >= row.available : cart.value.length >= 100;
}
onMounted(() => void fetchPage());
</script>

<template>
  <section class="sale-panel activity-stack" :aria-labelledby="label">
    <h2 :id="label">{{ heading }}</h2>
    <form class="activity-search" role="search" @submit.prevent="searchItems">
      <div class="field">
        <label :for="label + '-query'">Modelo, marca o SKU</label>
        <InputText :id="label + '-query'" v-model="search" maxlength="120" fluid />
      </div>
      <Button type="submit" label="Buscar" icon="pi pi-search" :loading="loading" />
    </form>
    <Message v-if="error" severity="error">
      {{ error }}
      <button type="button" class="inline-action" @click="fetchPage(page)">Reintentar</button>
    </Message>
    <p v-else-if="!items.length" class="sale-muted">
      {{ loading ? 'Cargando tallas…' : 'No hay tallas disponibles.' }}
    </p>
    <div v-else class="pos-results" :aria-busy="loading">
      <article v-for="product in items" :key="product.id" class="pos-product">
        <span class="pos-size">Talla {{ product.size }}</span>
        <div class="pos-product-info">
          <strong>{{ product.modelName }}</strong>
          <span
            >{{ product.brandName
            }}<template v-if="product.color"> · {{ product.color }}</template></span
          >
          <small>{{ product.sku }} · {{ product.available }} disponibles</small>
        </div>
        <div class="pos-product-action">
          <strong>{{ formatMoney(product.salePriceUsd, 'USD') }}</strong>
          <Button
            type="button"
            label="Agregar"
            icon="pi pi-plus"
            size="small"
            variant="outlined"
            :disabled="loading || isFull(product)"
            :aria-label="'Agregar ' + product.modelName + ', talla ' + product.size"
            @click="add(product)"
          />
        </div>
      </article>
    </div>
    <Paginator
      v-if="total > limit"
      :rows="limit"
      :total-records="total"
      :first="(page - 1) * limit"
      template="PrevPageLink CurrentPageReport NextPageLink"
      @page="fetchPage($event.page + 1)"
    />
    <div v-if="cart.length" class="activity-stack">
      <h3>Tallas seleccionadas</h3>
      <div v-for="(entry, index) in cart" :key="entry.row.id" class="activity-cart-line">
        <div class="pos-product-info">
          <strong>{{ entry.row.modelName }}</strong>
          <small>Talla {{ entry.row.size }} · {{ entry.row.sku }}</small>
        </div>
        <div class="field">
          <label :for="label + '-' + entry.row.id">Pares</label>
          <InputText
            :id="label + '-' + entry.row.id"
            v-model="entry.quantity"
            inputmode="numeric"
            maxlength="6"
            fluid
          />
        </div>
        <Button
          icon="pi pi-trash"
          severity="secondary"
          variant="text"
          type="button"
          :aria-label="'Quitar ' + entry.row.modelName + ', talla ' + entry.row.size"
          @click="cart.splice(index, 1)"
        />
      </div>
      <dl class="activity-amount">
        <dt>Subtotal USD</dt>
        <dd>{{ formatMoney(cartTotal(cart), 'USD') }}</dd>
      </dl>
    </div>
  </section>
</template>
