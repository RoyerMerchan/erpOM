<script setup lang="ts">
import { catalogInput, catalogPdfInput } from '@max-sport/shared';
import type { CatalogPreview, CatalogVersion } from '@max-sport/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import Paginator from 'primevue/paginator';
import { computed, onMounted, ref } from 'vue';
import {
  downloadCatalog,
  downloadVersion,
  getCatalog,
  getCatalogVersions,
} from '../analytics/service';
import AppShell from '../components/AppShell.vue';
import { financeMoment } from '../finance/form';
import type { FieldValue } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { usePagedList } from '../master-data/usePagedList';
import { decimalText, failureMessage, formatMoney, operationKey } from '../purchasing/form';
import UsdRateField from '../sales/UsdRateField.vue';
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
const brandId = ref<FieldValue>(null);
const modelId = ref<FieldValue>(null);
const size = ref<number | null>(null);
const currencyCode = ref<FieldValue>('USD');
const unitsPerUsd = ref('');
const includeQuantity = ref(false);
const save = ref(false);
const downloading = ref(false);
const error = ref('');
const success = ref('');
const versionId = ref<string>();
const info = ref<CatalogPreview>();
const applied = ref(catalogInput.parse({}));
const selectedRateTime = new Date().toISOString();
let idFor = operationKey();
let revision = 0;
const current = computed(() =>
  catalogInput.safeParse({
    brandId: brandId.value ?? undefined,
    modelId: modelId.value ?? undefined,
    size: size.value ?? undefined,
    currencyCode: currencyCode.value,
    unitsPerUsd: currencyCode.value === 'USD' ? null : decimalText(unitsPerUsd.value) || null,
    includeQuantity: includeQuantity.value,
  }),
);
const fresh = computed(
  () =>
    current.value.success && JSON.stringify(current.value.data) === JSON.stringify(applied.value),
);
const catalog = usePagedList<CatalogPreview['items'][number]>(async (query) => {
  const version = ++revision;
  const result = await getCatalog(query);
  if (revision === version) info.value = result;
  return result;
});
const { items, page, limit, total, loading, error: loadError } = catalog;
limit.value = 18;
const versions = usePagedList(getCatalogVersions);
const {
  items: saved,
  page: savedPage,
  total: savedTotal,
  limit: savedLimit,
  loading: loadingVersions,
  error: historyError,
} = versions;
savedLimit.value = 10;
const sizes = Array.from({ length: 17 }, (_, i) => i + 28);

function loadCatalog(pageNumber = 1) {
  const query = Object.fromEntries(
    Object.entries(applied.value)
      .filter(([, value]) => value != null)
      .map(([key, value]) => [key, String(value)]),
  );
  return catalog.load(query, pageNumber);
}
function apply() {
  if (!current.value.success) {
    error.value = current.value.error.issues[0]?.message ?? 'Revisa los filtros.';
    return;
  }
  error.value = '';
  success.value = '';
  applied.value = current.value.data;
  void loadCatalog();
}
async function download() {
  if (downloading.value || !fresh.value) return;
  const body = { ...applied.value, save: save.value };
  const request = catalogPdfInput.safeParse({
    ...body,
    ...(save.value ? { operationId: idFor(body) } : {}),
  });
  if (!request.success) {
    error.value = request.error.issues[0]?.message ?? 'Revisa los datos del catálogo.';
    return;
  }
  downloading.value = true;
  error.value = '';
  success.value = '';
  try {
    await downloadCatalog(request.data);
    if (request.data.save) {
      idFor = operationKey();
      success.value = 'Versión guardada en el historial.';
      void versions.load({}, 1);
    }
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo descargar el catálogo.');
  } finally {
    downloading.value = false;
  }
}
async function restoreFile(record: CatalogVersion) {
  if (versionId.value) return;
  versionId.value = record.id;
  error.value = '';
  try {
    await downloadVersion(record.id, record.filename);
  } catch (failure) {
    error.value = failureMessage(failure, 'No se pudo descargar esta versión.');
  } finally {
    versionId.value = undefined;
  }
}

onMounted(() => {
  void loadCatalog();
  void versions.load({});
});
</script>

<template>
  <AppShell>
    <header class="module-heading">
      <div>
        <h1>Catálogo PDF</h1>
        <p>Modelos, tallas disponibles y precios para compartir con clientes.</p>
      </div>
    </header>
    <form class="sale-panel analytics-content" @submit.prevent="apply">
      <div class="finance-fields">
        <div v-if="session.can('brands.read')" class="field">
          <label for="market-brand">Marca</label>
          <LookupSelect
            id="market-brand"
            v-model="brandId"
            resource="brands"
            placeholder="Todas"
            clearable
          />
        </div>
        <div v-if="session.can('models.read')" class="field">
          <label for="market-model">Modelo</label>
          <LookupSelect
            id="market-model"
            v-model="modelId"
            resource="models"
            placeholder="Todos"
            clearable
          />
        </div>
        <div class="field">
          <label for="market-size">Talla</label>
          <select id="market-size" v-model="size" class="sale-native-select">
            <option :value="null">Todas</option>
            <option v-for="option in sizes" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>
        <div class="field">
          <label for="market-currency">Moneda adicional</label>
          <LookupSelect
            id="market-currency"
            v-model="currencyCode"
            resource="currencies"
            @update:model-value="unitsPerUsd = ''"
          />
        </div>
        <UsdRateField
          v-if="typeof currencyCode === 'string' && currencyCode !== 'USD'"
          id="market-rate"
          v-model="unitsPerUsd"
          :currency="currencyCode"
          :quote-at="session.can('sales.create') ? undefined : selectedRateTime"
        />
      </div>
      <div class="analytics-checks">
        <label v-if="session.can('catalog.quantity')" for="market-quantity" class="activity-check">
          <Checkbox v-model="includeQuantity" input-id="market-quantity" binary /> Incluir
          cantidades exactas
        </label>
        <label for="market-save" class="activity-check">
          <Checkbox v-model="save" input-id="market-save" binary /> Guardar una versión al descargar
        </label>
      </div>
      <div class="sale-actions analytics-catalog-actions">
        <Button
          type="submit"
          label="Aplicar filtros"
          icon="pi pi-filter"
          variant="outlined"
          :loading="loading"
        />
        <Button
          type="button"
          label="Descargar PDF"
          icon="pi pi-download"
          :loading="downloading"
          :disabled="!info || !!loadError || !fresh || loading"
          @click="download"
        />
      </div>
    </form>
    <Message v-if="error || loadError" class="activity-message" severity="error">
      {{ error || loadError }}
      <button v-if="loadError" type="button" class="inline-action" @click="loadCatalog(page)">
        Reintentar
      </button>
    </Message>
    <Message v-if="success" class="activity-message" severity="success">{{ success }}</Message>

    <section class="analytics-content" aria-labelledby="market-preview">
      <header class="analytics-section-header sale-panel-header">
        <div>
          <h2 id="market-preview">Vista previa</h2>
          <p v-if="info" class="sale-muted">
            {{ info.shopName }} · {{ total }} modelos por combinación de color y precio
          </p>
        </div>
      </header>
      <p v-if="loading && !items.length" class="sale-muted" role="status">
        Cargando disponibilidad…
      </p>
      <p v-else-if="!items.length && !loadError" class="sale-muted">
        Sin tallas disponibles para estos filtros.
      </p>
      <div v-else class="catalog-preview" :aria-busy="loading">
        <article
          v-for="item in items"
          :key="[item.brand, item.model, item.color, item.priceUsd].join('|')"
          class="sale-panel catalog-product"
        >
          <div class="sale-panel-header">
            <div>
              <h3>{{ item.model }}</h3>
              <p class="sale-muted">
                {{ item.brand }}<template v-if="item.color"> · {{ item.color }}</template>
              </p>
            </div>
            <div class="catalog-price">
              <strong>{{ formatMoney(item.priceUsd, 'USD') }}</strong>
              <span v-if="item.priceLocal" class="sale-muted">{{
                formatMoney(item.priceLocal, info?.currencyCode)
              }}</span>
            </div>
          </div>
          <ul class="catalog-sizes" aria-label="Tallas disponibles">
            <li v-for="unit in item.sizes" :key="unit.size">
              {{ unit.size
              }}<template v-if="unit.available !== undefined">
                · {{ unit.available }} disp.</template
              >
            </li>
          </ul>
          <p v-if="item.description">{{ item.description }}</p>
        </article>
      </div>
      <Paginator
        v-if="total > limit"
        :rows="limit"
        :total-records="total"
        :first="(page - 1) * limit"
        template="PrevPageLink CurrentPageReport NextPageLink"
        @page="loadCatalog($event.page + 1)"
      />
    </section>

    <section class="sale-panel analytics-content" aria-labelledby="market-history">
      <h2 id="market-history">Versiones guardadas</h2>
      <Message v-if="historyError" severity="error"
        >{{ historyError }}
        <button type="button" class="inline-action" @click="versions.load({}, savedPage)">
          Reintentar
        </button>
      </Message>
      <p v-else-if="loadingVersions && !saved.length" class="sale-muted" role="status">
        Cargando versiones…
      </p>
      <p v-else-if="!saved.length" class="sale-muted">Aún no hay versiones guardadas.</p>
      <ul v-else class="sale-detail-list">
        <li v-for="version in saved" :key="version.id">
          <div>
            <strong>{{ version.filename }}</strong>
            <span
              >{{ financeMoment(version.generatedAt, version.timezone) }} ·
              {{ version.actorName }} · {{ version.productCount }} combinaciones</span
            >
            <span>{{
              [
                version.brand,
                version.model,
                version.size ? 'Talla ' + version.size : null,
                version.currencyCode,
                version.includeQuantity ? 'Con cantidades' : null,
              ]
                .filter(Boolean)
                .join(' · ')
            }}</span>
          </div>
          <Button
            type="button"
            label="Descargar"
            icon="pi pi-download"
            variant="outlined"
            size="small"
            :loading="versionId === version.id"
            :disabled="!!versionId"
            @click="restoreFile(version)"
          />
        </li>
      </ul>
      <Paginator
        v-if="savedTotal > savedLimit"
        :rows="savedLimit"
        :total-records="savedTotal"
        :first="(savedPage - 1) * savedLimit"
        template="PrevPageLink CurrentPageReport NextPageLink"
        @page="versions.load({}, $event.page + 1)"
      />
    </section>
  </AppShell>
</template>
