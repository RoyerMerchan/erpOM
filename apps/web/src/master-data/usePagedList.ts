import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { ApiRequestError } from '../api';

export function usePagedList<Row>(
  fetchPage: (query: Record<string, string>) => Promise<{ items: Row[]; total: number }>,
) {
  const items = shallowRef<Row[]>([]);
  const total = ref(0);
  const page = ref(1);
  const limit = ref(25);
  const loading = ref(false);
  const error = ref('');
  let revision = 0;

  async function load(filters: Record<string, string>, nextPage = page.value) {
    const current = ++revision;
    page.value = nextPage;
    loading.value = true;
    error.value = '';
    try {
      const result = await fetchPage({
        ...filters,
        page: String(nextPage),
        limit: String(limit.value),
      });
      if (current !== revision) return;
      const maxPage = Math.max(1, Math.ceil(result.total / limit.value));
      if (nextPage > maxPage) {
        await load(filters, maxPage);
        return;
      }
      items.value = result.items;
      total.value = result.total;
    } catch (failure) {
      if (current === revision) {
        items.value = [];
        total.value = 0;
        error.value =
          failure instanceof ApiRequestError ? failure.message : 'No se pudo cargar el listado.';
      }
    } finally {
      if (current === revision) loading.value = false;
    }
  }

  onBeforeUnmount(() => {
    revision++;
  });
  return { items, total, page, limit, loading, error, load };
}
