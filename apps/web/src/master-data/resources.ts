import {
  accountInput,
  accountKindLabels,
  brandInput,
  contactInput,
  modelInput,
  rateInput,
  rateRevisionInput,
  userCreateInput,
  userUpdateInput,
  variantInput,
} from '@max-sport/shared';
import type { ResourceKey } from '@max-sport/shared';
import type { ZodType } from 'zod';
import { browserTimeZone, localDateInput, nestedRow, textField, timeLabel } from './field-types';
import type { Field, FieldValue, FormValues } from './field-types';
import type { ResourceRow } from './service';

type DisplayColumn = { label: string; value: (row: ResourceRow) => string };
type Catalog = {
  title: string;
  createLabel: string;
  searchLabel: string;
  columns: DisplayColumn[];
  fields: Field[];
  schema: ZodType<unknown>;
  editSchema?: ZodType<unknown>;
};

const textColumn = (key: string, label: string): DisplayColumn => ({
  label,
  value: (row) => textField(row, key) || '—',
});
const contactFields: Field[] = [
  { key: 'name', label: 'Nombre', required: true, max: 160 },
  { key: 'document', label: 'Documento', nullable: true, max: 60 },
  { key: 'phone', label: 'Teléfono', nullable: true, max: 60 },
  { key: 'email', label: 'Correo electrónico', nullable: true, max: 254 },
  { key: 'address', label: 'Dirección', nullable: true, max: 500 },
  { key: 'notes', label: 'Notas', kind: 'textarea', nullable: true, max: 2_000 },
];
const contactColumns = [
  textColumn('name', 'Nombre'),
  textColumn('document', 'Documento'),
  textColumn('phone', 'Teléfono'),
  textColumn('email', 'Correo'),
];

const currencyField: Field = {
  key: 'currencyCode',
  label: 'Moneda',
  kind: 'select',
  lookup: 'currencies',
  required: true,
};
const sizes = Array.from({ length: 17 }, (_, index) => ({
  value: index + 28,
  label: String(index + 28),
}));

export const catalogs: Record<ResourceKey, Catalog> = {
  brands: {
    title: 'Marcas',
    createLabel: 'Nueva marca',
    searchLabel: 'Buscar marca',
    columns: [textColumn('name', 'Marca')],
    schema: brandInput,
    fields: [{ key: 'name', label: 'Nombre de la marca', required: true, max: 120 }],
  },
  models: {
    title: 'Modelos',
    createLabel: 'Nuevo modelo',
    searchLabel: 'Buscar por modelo o marca',
    columns: [
      textColumn('name', 'Modelo'),
      { label: 'Marca', value: (row) => textField(nestedRow(row, 'brand'), 'name') },
      textColumn('description', 'Descripción'),
    ],
    schema: modelInput,
    fields: [
      { key: 'name', label: 'Nombre del modelo', required: true, max: 140 },
      { key: 'brandId', label: 'Marca', kind: 'select', lookup: 'brands', required: true },
      { key: 'description', label: 'Descripción', kind: 'textarea', nullable: true, max: 2_000 },
    ],
  },
  variants: {
    title: 'Códigos por talla',
    createLabel: 'Preparar talla de catálogo',
    searchLabel: 'Buscar por modelo, marca, talla o SKU',
    columns: [
      { label: 'Modelo', value: (row) => textField(nestedRow(row, 'model'), 'name') },
      {
        label: 'Marca',
        value: (row) => textField(nestedRow(nestedRow(row, 'model'), 'brand'), 'name'),
      },
      { label: 'Talla', value: (row) => String(row.size) },
      textColumn('sku', 'SKU'),
      textColumn('color', 'Color'),
      textColumn('salePriceUsd', 'Precio USD'),
    ],
    schema: variantInput,
    fields: [
      { key: 'modelId', label: 'Modelo', kind: 'select', lookup: 'models', required: true },
      { key: 'size', label: 'Talla', kind: 'select', options: sizes, required: true },
      { key: 'sku', label: 'SKU', required: true, max: 60 },
      { key: 'color', label: 'Color', nullable: true, max: 80 },
      { key: 'salePriceUsd', label: 'Precio en USD', numericText: true, required: true },
      {
        key: 'lowStockThreshold',
        label: 'Umbral de stock bajo',
        kind: 'number',
        min: 0,
        nullable: true,
        help: 'Vacío para usar el valor general de la tienda.',
      },
    ],
  },
  customers: {
    title: 'Clientes',
    createLabel: 'Nuevo cliente',
    searchLabel: 'Buscar por nombre, documento o contacto',
    columns: contactColumns,
    schema: contactInput,
    fields: contactFields,
  },
  suppliers: {
    title: 'Proveedores',
    createLabel: 'Nuevo proveedor',
    searchLabel: 'Buscar por nombre, documento o contacto',
    columns: contactColumns,
    schema: contactInput,
    fields: contactFields,
  },
  accounts: {
    title: 'Cuentas',
    createLabel: 'Nueva cuenta',
    searchLabel: 'Buscar cuenta',
    columns: [
      textColumn('name', 'Cuenta'),
      textColumn('currencyCode', 'Moneda'),
      {
        label: 'Canal',
        value: (row) => accountKindLabels[row.kind as keyof typeof accountKindLabels] ?? '—',
      },
    ],
    schema: accountInput,
    fields: [
      { key: 'name', label: 'Nombre de la cuenta', required: true, max: 120 },
      currencyField,
      {
        key: 'kind',
        label: 'Canal',
        kind: 'select',
        required: true,
        options: Object.entries(accountKindLabels).map(([value, label]) => ({ value, label })),
      },
    ],
  },
  rates: {
    title: 'Tasas históricas',
    createLabel: 'Registrar tasa',
    searchLabel: 'Buscar por moneda o autor',
    columns: [
      textColumn('currencyCode', 'Moneda'),
      textColumn('unitsPerUsd', 'Unidades por USD'),
      { label: 'Vigente desde', value: (row) => timeLabel(textField(row, 'effectiveAt')) },
      { label: 'Registrada', value: (row) => timeLabel(textField(row, 'createdAt')) },
      { label: 'Autor', value: (row) => textField(nestedRow(row, 'createdBy'), 'displayName') },
    ],
    schema: rateInput,
    editSchema: rateRevisionInput,
    fields: [
      currencyField,
      {
        key: 'unitsPerUsd',
        label: '1 USD = X unidades',
        numericText: true,
        required: true,
        help: 'Escribe 4000 para cuatro mil. Usa coma o punto para los decimales, sin separar miles.',
      },
      {
        key: 'effectiveAt',
        label: 'Vigente desde',
        kind: 'date',
        required: true,
        help: browserTimeZone,
      },
    ],
  },
  users: {
    title: 'Usuarios',
    createLabel: 'Nuevo usuario',
    searchLabel: 'Buscar por nombre, usuario, correo o rol',
    columns: [
      textColumn('displayName', 'Nombre'),
      textColumn('username', 'Usuario'),
      textColumn('email', 'Correo electrónico'),
      { label: 'Rol', value: (row) => textField(nestedRow(row, 'role'), 'label') },
      {
        label: 'Acceso',
        value: (row) =>
          row.mustChangePassword ? 'Cambio de contraseña pendiente' : 'Contraseña configurada',
      },
    ],
    schema: userCreateInput,
    editSchema: userUpdateInput,
    fields: [
      { key: 'displayName', label: 'Nombre', required: true, max: 120 },
      {
        key: 'username',
        label: 'Usuario',
        required: true,
        max: 40,
        help: 'De 3 a 40 caracteres. Usa letras, números, puntos, guiones o guiones bajos.',
      },
      { key: 'email', label: 'Correo electrónico', required: true, max: 254 },
      { key: 'roleCode', label: 'Rol', kind: 'select', lookup: 'roles', required: true },
      {
        key: 'temporaryPassword',
        label: 'Contraseña temporal',
        kind: 'password',
        autocomplete: 'new-password',
        required: true,
        max: 128,
        help: 'Al menos 15 caracteres. El usuario deberá cambiarla al entrar.',
      },
    ],
  },
};

export function editorFields(
  resource: ResourceKey,
  row: ResourceRow | null,
  actorId?: string,
): Field[] {
  const fields = catalogs[resource].fields;
  if (!row) return fields;
  return fields.flatMap((field) => {
    if (resource === 'rates' && field.key === 'currencyCode') return [];
    if (resource === 'users' && field.key === 'roleCode' && row.id === actorId) {
      const role = nestedRow(row, 'role');
      return [
        {
          ...field,
          lookup: undefined,
          options: [{ value: textField(role, 'code'), label: textField(role, 'label') }],
          disabled: true,
        },
      ];
    }
    if (resource === 'users' && field.key === 'temporaryPassword') {
      return row.id === actorId ? [] : [{ ...field, required: false, omitEmpty: true }];
    }
    return [field];
  });
}

export function initialForm(fields: Field[], row: ResourceRow | null): FormValues {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.key === 'effectiveAt') {
        return [field.key, localDateInput(row ? textField(row, 'effectiveAt') : new Date())];
      }
      if (field.key === 'roleCode' && row)
        return [field.key, textField(nestedRow(row, 'role'), 'code')];
      const existing = row?.[field.key];
      if (
        typeof existing === 'string' ||
        typeof existing === 'number' ||
        typeof existing === 'boolean'
      ) {
        return [field.key, existing as FieldValue];
      }
      return [
        field.key,
        field.defaultValue ?? (field.kind === 'number' || field.kind === 'select' ? null : ''),
      ];
    }),
  );
}
