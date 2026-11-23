<script setup lang="ts">
import { contactInput, saleInput } from '@max-sport/shared';
import type { ConfirmSaleInput, InventoryRow, SalePreview } from '@max-sport/shared';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Paginator from 'primevue/paginator';
import Textarea from 'primevue/textarea';
import { useConfirm } from 'primevue/useconfirm';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import type { FieldValue } from '../master-data/field-types';
import LookupSelect from '../master-data/LookupSelect.vue';
import { saveRecord } from '../master-data/service';
import { usePagedList } from '../master-data/usePagedList';
import { decimalText, failureMessage, formatMoney, operationKey } from '../purchasing/form';
import { getInventory } from '../purchasing/service';
import DiscountFields from '../sales/DiscountFields.vue';
import {
  discountDraft,
  discountInput,
  isStartedTender,
  tenderDraft,
  tenderInput,
} from '../sales/form';
import type { DiscountDraft } from '../sales/form';
import OperatorSelect from '../sales/OperatorSelect.vue';
import { postSale, previewSale } from '../sales/service';
import TenderFields from '../sales/TenderFields.vue';
import UsdRateField from '../sales/UsdRateField.vue';
import { useSessionStore } from '../stores/session';

type CartLine = { product: InventoryRow; quantity: string; discount: DiscountDraft };
const session = useSessionStore();
const router = useRouter();
const confirm = useConfirm();
const {
  items: results,
  total,
  page,
  limit,
  loading: searching,
  error: searchError,
  load,
} = usePagedList(getInventory);
limit.value = 12;
const search = ref('');
const size = ref('');
const catalogFilters = ref({ q: '', size: '' });
const cart = ref<CartLine[]>([]);
const customerId = ref<FieldValue>(null);
const sellerId = ref<string | null>(null);
const notes = ref('');
const globalDiscount = ref(discountDraft());
const payments = ref([tenderDraft()]);
const change = ref<ReturnType<typeof tenderDraft> | null>(null);
const displayCurrency = ref<FieldValue>('USD');
const displayRate = ref('');
const quote = ref<{ data: SalePreview; input: string }>();
const attempt = ref<ConfirmSaleInput>();
const newOperation = operationKey();
const quoting = ref(false);
const confirming = ref(false);
const error = ref('');
const customerDialog = ref(false);
const newCustomer = reactive({ name: '', document: '', phone: '' });
const savingCustomer = ref(false);
const customerError = ref('');
const pairCount = computed(() =>
  cart.value.reduce((count, item) => count + (Number(item.quantity) || 0), 0),
);

const sale = computed(() =>
  saleInput.safeParse({
    customerId: customerId.value,
    sellerId: sellerId.value,
    notes: notes.value,
    items: cart.value.map(({ product, quantity, discount }) => ({
      variantId: product.id,
      quantity: Number(quantity),
      discount: discountInput(discount),
    })),
    globalDiscount: discountInput(globalDiscount.value),
    payments: payments.value.filter(isStartedTender).map(tenderInput),
    change: change.value ? tenderInput(change.value) : null,
    displayQuote:
      displayCurrency.value === 'USD'
        ? null
        : {
            currencyCode: displayCurrency.value,
            unitsPerUsd: decimalText(displayRate.value) || null,
          },
  }),
);
const currentQuote = computed(() =>
  sale.value.success && quote.value?.input === JSON.stringify(sale.value.data)
    ? quote.value.data
    : undefined,
);

function fetchProducts(nextPage = 1) {
  const { q, size: selectedSize } = catalogFilters.value;
  return load({ stock: 'AVAILABLE', q, ...(selectedSize ? { size: selectedSize } : {}) }, nextPage);
}

function searchProducts() {
  catalogFilters.value = { q: search.value.trim(), size: size.value };
  void fetchProducts();
}

function quantityOf(id: string) {
  return Number(cart.value.find(({ product }) => product.id === id)?.quantity ?? 0);
}

function addProduct(product: InventoryRow) {
  error.value = '';
  const line = cart.value.find((item) => item.product.id === product.id);
  if (line) {
    line.quantity = String((Number(line.quantity) || 0) + 1);
    line.product = product;
  } else {
    cart.value.push({ product, quantity: '1', discount: discountDraft() });
  }
}

async function calculate() {
  if (quoting.value || attempt.value) return;
  error.value = '';
  if (!sale.value.success) {
    error.value = sale.value.error.issues[0]?.message ?? 'Revisa los datos de la venta.';
    return;
  }
  const input = sale.value.data;
  const fingerprint = JSON.stringify(input);
  quoting.value = true;
  try {
    quote.value = { data: await previewSale(input), input: fingerprint };
  } catch (failure) {
    quote.value = undefined;
    error.value = failureMessage(failure, 'No se pudo calcular la venta.');
    void fetchProducts(page.value);
  } finally {
    quoting.value = false;
  }
}

async function confirmSale() {
  if (confirming.value) return;
  if (!attempt.value) {
    if (!sale.value.success || !currentQuote.value?.ready) return;
    const body = { quoteDigest: currentQuote.value.quoteDigest, sale: sale.value.data };
    attempt.value = { ...body, operationId: newOperation(body) };
  }
  error.value = '';
  confirming.value = true;
  try {
    const saved = await postSale(attempt.value);
    await router.replace({ name: 'sale-detail', params: { id: saved.id } });
  } catch (failure) {
    if (
      failure instanceof ApiRequestError &&
      failure.status &&
      failure.status < 500 &&
      failure.status !== 201
    ) {
      attempt.value = undefined;
      quote.value = undefined;
      error.value = failure.message;
      void fetchProducts(page.value);
    } else {
      error.value =
        'No se pudo comprobar el resultado de la venta. Reintenta la misma confirmación.';
    }
  } finally {
    confirming.value = false;
  }
}

function requestConfirmation() {
  if (attempt.value) {
    void confirmSale();
    return;
  }
  const calculated = currentQuote.value;
  if (!calculated?.ready) return;
  confirm.require({
    header: 'Confirmar venta',
    message:
      'Se registrará una venta por ' +
      formatMoney(calculated.totalUsd, 'USD') +
      ' y se descontarán ' +
      pairCount.value +
      ' pares del inventario.',
    rejectLabel: 'Volver al carrito',
    acceptLabel: 'Registrar venta',
    accept: () => void confirmSale(),
  });
}

function openCustomer() {
  Object.assign(newCustomer, { name: '', document: '', phone: '' });
  customerError.value = '';
  customerDialog.value = true;
}

async function createCustomer() {
  if (savingCustomer.value) return;
  const input = contactInput.safeParse({ ...newCustomer, email: null, address: null, notes: null });
  if (!input.success) {
    customerError.value = input.error.issues[0]?.message ?? 'Revisa los datos del cliente.';
    return;
  }
  savingCustomer.value = true;
  customerError.value = '';
  try {
    const saved = await saveRecord('customers', null, input.data);
    customerId.value = saved.id;
    customerDialog.value = false;
  } catch (failure) {
    customerError.value = failureMessage(failure, 'No se pudo guardar el cliente.');
  } finally {
    savingCustomer.value = false;
  }
}

onMounted(() => void fetchProducts());
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <h1>Punto de venta</h1>
    </header>

    <div class="pos-layout">
      <section class="sale-panel pos-catalog" aria-labelledby="pos-products">
        <h2 id="pos-products">Productos disponibles</h2>
        <form class="pos-search" role="search" @submit.prevent="searchProducts">
          <div class="field">
            <label for="pos-search">Modelo, marca o SKU</label>
            <InputText id="pos-search" v-model="search" maxlength="100" fluid />
          </div>
          <div class="field">
            <label for="pos-size">Talla</label>
            <select id="pos-size" v-model="size" class="sale-native-select">
              <option value="">Todas</option>
              <option v-for="n in 17" :key="n" :value="String(n + 27)">{{ n + 27 }}</option>
            </select>
          </div>
          <Button type="submit" label="Buscar" icon="pi pi-search" :loading="searching" />
        </form>

        <Message v-if="searchError" severity="error">
          {{ searchError }}
          <button type="button" class="inline-action" @click="fetchProducts(page)">
            Reintentar
          </button>
        </Message>
        <p v-else-if="searching && !results.length" class="sale-muted" role="status">
          Cargando productos…
        </p>
        <p v-else-if="!results.length" class="sale-empty">
          No hay variantes disponibles para esta búsqueda.
        </p>
        <div v-else class="pos-results" :aria-busy="searching">
          <article v-for="product in results" :key="product.id" class="pos-product">
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
                label="Agregar"
                icon="pi pi-plus"
                size="small"
                variant="outlined"
                :aria-label="'Agregar ' + product.modelName + ', talla ' + product.size"
                :disabled="
                  !!attempt ||
                  searching ||
                  quantityOf(product.id) >= product.available ||
                  (cart.length >= 100 && quantityOf(product.id) === 0)
                "
                @click="addProduct(product)"
              />
            </div>
          </article>
        </div>
        <Paginator
          v-if="total > limit"
          :rows="limit"
          :first="(page - 1) * limit"
          :total-records="total"
          template="PrevPageLink CurrentPageReport NextPageLink"
          @page="fetchProducts($event.page + 1)"
        />
      </section>

      <section class="sale-panel pos-checkout" aria-labelledby="pos-cart">
        <header class="sale-panel-header">
          <h2 id="pos-cart">Carrito</h2>
          <span class="sale-count" aria-live="polite"
            >{{ pairCount }} {{ pairCount === 1 ? 'par' : 'pares' }}</span
          >
        </header>
        <p v-if="!cart.length" class="sale-empty">Agrega una talla disponible para empezar.</p>
        <fieldset v-else :disabled="!!attempt" :inert="!!attempt" class="pos-edit">
          <div class="pos-lines">
            <article v-for="(line, index) in cart" :key="line.product.id" class="pos-line">
              <div class="pos-line-head">
                <div class="pos-product-info">
                  <strong>{{ line.product.modelName }}</strong>
                  <small>Talla {{ line.product.size }} · {{ line.product.sku }}</small>
                </div>
                <strong>
                  {{
                    formatMoney(
                      currentQuote?.items[index]?.netUsd ?? line.product.salePriceUsd,
                      'USD',
                    )
                  }}
                  <small v-if="!currentQuote"> / par</small>
                </strong>
                <Button
                  type="button"
                  icon="pi pi-trash"
                  variant="text"
                  severity="secondary"
                  size="small"
                  :aria-label="'Quitar ' + line.product.modelName + ', talla ' + line.product.size"
                  @click="cart.splice(index, 1)"
                />
              </div>
              <div class="pos-line-controls">
                <div class="field">
                  <label :for="'qty-' + line.product.id">Cantidad</label>
                  <InputText
                    :id="'qty-' + line.product.id"
                    v-model="line.quantity"
                    inputmode="numeric"
                    maxlength="6"
                    fluid
                  />
                </div>
                <details v-if="session.can('sales.discount')" class="pos-line-discount">
                  <summary>
                    Descuento de línea<span v-if="line.discount.kind !== 'NONE'"> aplicado</span>
                  </summary>
                  <DiscountFields :id="'discount-' + line.product.id" v-model="line.discount" />
                </details>
              </div>
            </article>
          </div>

          <div class="pos-people sale-fields">
            <div v-if="session.can('customers.read')" class="field">
              <label for="pos-customer">Cliente</label>
              <LookupSelect
                id="pos-customer"
                v-model="customerId"
                resource="customers"
                clearable
                placeholder="Consumidor final"
              />
              <button
                v-if="session.can('customers.create')"
                type="button"
                class="inline-action"
                @click="openCustomer"
              >
                Crear cliente
              </button>
            </div>
            <div class="field">
              <label for="pos-seller">Vendedor</label>
              <OperatorSelect
                v-if="session.can('sales.assign')"
                id="pos-seller"
                v-model="sellerId"
                :placeholder="session.user?.displayName ?? 'Vendedor actual'"
              />
              <InputText
                v-else
                id="pos-seller"
                :model-value="session.user?.displayName"
                readonly
                fluid
              />
            </div>
          </div>

          <details v-if="session.can('sales.discount')" class="pos-section">
            <summary>
              Descuento de toda la venta<span v-if="globalDiscount.kind !== 'NONE'"> aplicado</span>
            </summary>
            <DiscountFields id="pos-global-discount" v-model="globalDiscount" />
          </details>
          <details class="pos-section">
            <summary>Moneda para mostrar el total</summary>
            <div class="sale-fields">
              <div class="field">
                <label for="pos-display-currency">Moneda</label>
                <LookupSelect
                  id="pos-display-currency"
                  v-model="displayCurrency"
                  resource="currencies"
                  @update:model-value="displayRate = ''"
                />
              </div>
              <UsdRateField
                v-if="typeof displayCurrency === 'string' && displayCurrency !== 'USD'"
                id="pos-display-rate"
                :currency="displayCurrency"
                v-model="displayRate"
              />
            </div>
          </details>
          <details class="pos-section">
            <summary>Notas internas</summary>
            <div class="field">
              <label for="pos-notes">Notas de la venta</label>
              <Textarea id="pos-notes" v-model="notes" rows="2" maxlength="2000" fluid />
            </div>
          </details>

          <section class="pos-tenders" aria-labelledby="pos-payments">
            <header class="sale-panel-header">
              <h3 id="pos-payments">Cobros</h3>
              <Button
                type="button"
                label="Agregar cobro"
                icon="pi pi-plus"
                size="small"
                variant="text"
                :disabled="payments.length >= 20"
                @click="payments.push(tenderDraft())"
              />
            </header>
            <div v-for="(payment, index) in payments" :key="payment.key" class="pos-tender">
              <header class="sale-panel-header">
                <strong>Cobro {{ index + 1 }}</strong>
                <Button
                  type="button"
                  icon="pi pi-times"
                  severity="secondary"
                  variant="text"
                  size="small"
                  :aria-label="'Quitar cobro ' + (index + 1)"
                  @click="payments.splice(index, 1)"
                />
              </header>
              <TenderFields v-model="payments[index]!" />
            </div>
            <div v-if="change" class="pos-tender">
              <header class="sale-panel-header">
                <strong>Vuelto entregado</strong>
                <Button
                  type="button"
                  icon="pi pi-times"
                  severity="secondary"
                  variant="text"
                  size="small"
                  aria-label="Quitar vuelto"
                  @click="change = null"
                />
              </header>
              <TenderFields v-model="change" change />
            </div>
            <Button
              v-else
              type="button"
              label="Registrar vuelto"
              icon="pi pi-undo"
              variant="text"
              size="small"
              @click="change = tenderDraft()"
            />
          </section>
        </fieldset>

        <div v-if="cart.length" class="pos-checkout-footer">
          <div v-if="quote" class="sale-totals" aria-live="polite">
            <p v-if="!currentQuote" class="sale-muted">Hay cambios pendientes de calcular.</p>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{{ formatMoney(quote.data.subtotalUsd, 'USD') }}</dd>
              </div>
              <div>
                <dt>Descuentos</dt>
                <dd>{{ formatMoney(quote.data.discountUsd, 'USD') }}</dd>
              </div>
              <div class="sale-total">
                <dt>Total</dt>
                <dd>{{ formatMoney(quote.data.totalUsd, 'USD') }}</dd>
              </div>
              <div v-if="quote.data.localTotal">
                <dt>Equivalente en {{ quote.data.localTotal.currencyCode }}</dt>
                <dd>
                  {{
                    formatMoney(quote.data.localTotal.amount, quote.data.localTotal.currencyCode)
                  }}
                </dd>
              </div>
              <div>
                <dt>Recibido</dt>
                <dd>{{ formatMoney(quote.data.tenderedUsd, 'USD') }}</dd>
              </div>
              <div>
                <dt>Vuelto requerido</dt>
                <dd>{{ formatMoney(quote.data.changeDueUsd, 'USD') }}</dd>
              </div>
              <div>
                <dt>Vuelto registrado</dt>
                <dd>{{ formatMoney(quote.data.changeUsd, 'USD') }}</dd>
              </div>
              <div>
                <dt>Abonado neto</dt>
                <dd>{{ formatMoney(quote.data.netCollectedUsd, 'USD') }}</dd>
              </div>
              <div>
                <dt>Saldo pendiente</dt>
                <dd>{{ formatMoney(quote.data.balanceDueUsd, 'USD') }}</dd>
              </div>
              <div v-if="quote.data.cogsUsd !== undefined">
                <dt>Costo estimado</dt>
                <dd>{{ formatMoney(quote.data.cogsUsd, 'USD') }}</dd>
              </div>
              <div v-if="quote.data.grossProfitUsd !== undefined">
                <dt>Utilidad estimada</dt>
                <dd>{{ formatMoney(quote.data.grossProfitUsd, 'USD') }}</dd>
              </div>
            </dl>
            <ul
              v-if="quote.data.tenders.length"
              class="sale-detail-list"
              aria-label="Equivalencias de los cobros"
            >
              <li v-for="(tender, index) in quote.data.tenders" :key="index">
                <div>
                  <strong
                    >{{ tender.kind === 'PAYMENT' ? 'Cobro' : 'Vuelto' }} ·
                    {{ tender.accountName }}</strong
                  >
                  <span>{{ formatMoney(tender.amountOriginal, tender.currencyCode) }}</span>
                </div>
                <strong>{{ formatMoney(tender.amountUsd, 'USD') }}</strong>
              </li>
            </ul>
            <p v-if="currentQuote && !currentQuote.ready" class="sale-muted">
              Completa el cobro y el vuelto para confirmar.
            </p>
          </div>
          <Message v-if="error" severity="error">{{ error }}</Message>
          <div class="sale-actions">
            <Button
              type="button"
              label="Calcular venta"
              icon="pi pi-calculator"
              variant="outlined"
              :loading="quoting"
              :disabled="!!attempt"
              @click="calculate"
            />
            <Button
              type="button"
              :label="attempt && !confirming ? 'Reintentar confirmación' : 'Confirmar venta'"
              icon="pi pi-check"
              :loading="confirming"
              :disabled="quoting || (!attempt && !currentQuote?.ready)"
              @click="requestConfirmation"
            />
          </div>
        </div>
      </section>
    </div>

    <Dialog
      v-model:visible="customerDialog"
      modal
      header="Crear cliente"
      :style="{ width: 'min(92vw, 26rem)' }"
      :closable="!savingCustomer"
    >
      <form class="sale-customer-form" @submit.prevent="createCustomer">
        <div class="field">
          <label for="pos-new-customer">Nombre</label>
          <InputText
            id="pos-new-customer"
            v-model="newCustomer.name"
            maxlength="160"
            required
            fluid
          />
        </div>
        <div class="field">
          <label for="pos-new-document">Documento</label>
          <InputText id="pos-new-document" v-model="newCustomer.document" maxlength="60" fluid />
        </div>
        <div class="field">
          <label for="pos-new-phone">Teléfono</label>
          <InputText
            id="pos-new-phone"
            v-model="newCustomer.phone"
            type="tel"
            maxlength="60"
            fluid
          />
        </div>
        <Message v-if="customerError" severity="error">{{ customerError }}</Message>
        <Button
          type="submit"
          label="Guardar y seleccionar"
          icon="pi pi-check"
          :loading="savingCustomer"
        />
      </form>
    </Dialog>
  </AppShell>
</template>
