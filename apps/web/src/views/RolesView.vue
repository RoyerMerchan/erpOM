<script setup lang="ts">
import { roleRecord } from '@max-sport/shared';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { onMounted, ref } from 'vue';
import type { z } from 'zod';
import { ApiRequestError } from '../api';
import AppShell from '../components/AppShell.vue';
import SectionLinks from '../components/SectionLinks.vue';
import { getRoles, putFinancialPermissions } from '../master-data/service';
import { useSessionStore } from '../stores/session';

type Role = z.output<typeof roleRecord>;
const session = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const roles = ref<Role[]>([]);
const initial = ref<Record<string, Pick<Role, 'costs' | 'profits'>>>({});
const loading = ref(true);
const error = ref('');
const saving = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    roles.value = await getRoles();
    initial.value = Object.fromEntries(
      roles.value.map(({ code, costs, profits }) => [code, { costs, profits }]),
    );
  } catch (failure) {
    error.value =
      failure instanceof ApiRequestError ? failure.message : 'No se pudieron cargar los roles.';
  } finally {
    loading.value = false;
  }
}

function canSave(role: Role) {
  const previous = initial.value[role.code];
  return previous && (role.costs !== previous.costs || role.profits !== previous.profits);
}

async function save(role: Role) {
  saving.value = role.code;
  try {
    const updated = await putFinancialPermissions(role.code, {
      costs: role.costs,
      profits: role.profits,
    });
    initial.value[role.code] = { costs: updated.costs, profits: updated.profits };
    toast.add({ severity: 'success', summary: 'Acceso actualizado', life: 3500 });
  } catch (failure) {
    toast.add({
      severity: 'error',
      summary:
        failure instanceof ApiRequestError ? failure.message : 'No se pudo actualizar el acceso.',
      life: 6000,
    });
  } finally {
    saving.value = '';
  }
}

function confirmSave(role: Role) {
  confirm.require({
    header: 'Actualizar acceso',
    message: 'Los permisos se aplicarán a todas las cuentas del rol ' + role.label + '.',
    acceptProps: { label: 'Guardar' },
    rejectProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
    accept: () => void save(role),
  });
}

onMounted(load);
</script>

<template>
  <AppShell>
    <SectionLinks />
    <header class="module-heading">
      <div>
        <h1>Roles y acceso</h1>
        <p>Configura quién puede consultar costos y utilidad.</p>
      </div>
    </header>
    <p v-if="loading" class="records-empty" role="status">Cargando roles…</p>
    <Message v-else-if="error" severity="error"
      >{{ error }}
      <button type="button" class="inline-action" @click="load">Reintentar</button></Message
    >
    <p v-else-if="!roles.length" class="records-empty">No hay roles disponibles.</p>
    <section v-else class="records-panel role-list" aria-label="Acceso financiero por rol">
      <article v-for="role in roles" :key="role.code" class="role-line">
        <h2>{{ role.label }}</h2>
        <div class="role-options">
          <div class="checkbox-label">
            <Checkbox
              v-model="role.costs"
              :input-id="role.code + '-costs'"
              :disabled="
                role.code === 'ADMIN' || !!saving || !session.can('roles.financial.update')
              "
              binary
            />
            <label :for="role.code + '-costs'">Costos</label>
          </div>
          <div class="checkbox-label">
            <Checkbox
              v-model="role.profits"
              :input-id="role.code + '-profits'"
              :disabled="
                role.code === 'ADMIN' || !!saving || !session.can('roles.financial.update')
              "
              binary
            />
            <label :for="role.code + '-profits'">Utilidad</label>
          </div>
        </div>
        <Button
          v-if="role.code !== 'ADMIN' && session.can('roles.financial.update')"
          outlined
          size="small"
          label="Guardar"
          :disabled="!canSave(role) || !!saving"
          :loading="saving === role.code"
          @click="confirmSave(role)"
        />
      </article>
    </section>
  </AppShell>
</template>
