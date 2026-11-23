import { z } from 'zod';
import { roleCodeSchema } from './access.js';
import { emailSchema, newPasswordSchema, passwordSchema } from './identity.js';

const requiredText = (max: number) => z.string().trim().min(1, 'Completa este campo.').max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);
const threshold = z.number().int().min(0).max(2_147_483_647);
const date = z.iso.datetime({ offset: true });
export const currencyCodeSchema = z.enum(['USD', 'COP', 'VES', 'USDT']);
export const accountKindSchema = z.enum(['CASH', 'BANK', 'MOBILE', 'CRYPTO', 'OTHER']);
export const accountKindLabels = {
  CASH: 'Efectivo',
  BANK: 'Banco',
  MOBILE: 'Pago móvil',
  CRYPTO: 'Billetera digital',
  OTHER: 'Otro',
};
export const sizeSchema = z
  .number()
  .int()
  .min(28, 'La talla inicial mínima es 28.')
  .max(44, 'La talla inicial máxima es 44.');
export const skuSchema = requiredText(60)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().max(60));
const positiveDecimal = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .regex(pattern, message)
    .refine((value) => /[1-9]/.test(value), 'Ingresa un valor mayor que cero.');
export const salePriceSchema = positiveDecimal(
  /^\d{1,16}(\.\d{1,2})?$/,
  'Usa un precio USD con hasta dos decimales.',
);
export const unitsPerUsdSchema = positiveDecimal(
  /^\d{1,18}(\.\d{1,12})?$/,
  'Usa una tasa con hasta 18 enteros y 12 decimales.',
);
export const unitRate = (value: string) => /^0*1(?:\.0+)?$/.test(value);

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['all', 'active', 'archived']).default('all'),
  currencyCode: currencyCodeSchema.optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), total: z.number().int().nonnegative() });
}

export const brandInput = z.object({ name: requiredText(120) });
export const modelInput = z.object({
  name: requiredText(140),
  brandId: z.uuid('Selecciona una marca.'),
  description: optionalText(2_000),
});
export const variantInput = z.object({
  modelId: z.uuid('Selecciona un modelo.'),
  size: sizeSchema,
  color: optionalText(80),
  sku: skuSchema,
  salePriceUsd: salePriceSchema,
  lowStockThreshold: threshold.nullable(),
});
export const contactInput = z.object({
  name: requiredText(160),
  document: optionalText(60),
  phone: optionalText(60),
  email: emailSchema.nullable(),
  address: optionalText(500),
  notes: optionalText(2_000),
});
export const accountInput = z.object({
  name: requiredText(120),
  currencyCode: currencyCodeSchema,
  kind: accountKindSchema,
});
export const rateRevisionInput = z.object({ unitsPerUsd: unitsPerUsdSchema, effectiveAt: date });
export const rateInput = rateRevisionInput
  .extend({ currencyCode: currencyCodeSchema })
  .refine(({ currencyCode, unitsPerUsd }) => currencyCode !== 'USD' || unitRate(unitsPerUsd), {
    path: ['unitsPerUsd'],
    message: 'Para USD, la tasa debe ser exactamente 1.',
  });
const staffProfile = z.object({
  displayName: requiredText(120),
  email: emailSchema,
  roleCode: roleCodeSchema,
});
export const userCreateInput = staffProfile.extend({ temporaryPassword: newPasswordSchema });
export const userUpdateInput = staffProfile.extend({
  temporaryPassword: newPasswordSchema.optional(),
});
export const changePasswordInput = z
  .object({
    currentPassword: passwordSchema,
    newPassword: newPasswordSchema,
  })
  .refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
    path: ['newPassword'],
    message: 'La contraseña nueva debe ser diferente.',
  });
export const timezoneSchema = requiredText(80).refine((value) => {
  if (!/^[a-z][a-z_+-]*(?:\/[a-z0-9_+-]+)*$/i.test(value)) return false;
  try {
    new Intl.DateTimeFormat('es', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Elige una zona horaria IANA válida, por ejemplo America/Caracas.');
export const shopInput = z.object({
  name: requiredText(160),
  timezone: timezoneSchema,
  logoUrl: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https?$/ }))
    .nullable(),
  lowStockThreshold: threshold,
});
export const currencyInput = z.object({
  name: requiredText(80),
  minorUnits: z.number().int().min(0).max(8),
  active: z.boolean(),
});
export const financialPermissionsInput = z.object({ costs: z.boolean(), profits: z.boolean() });

const row = z.object({ id: z.uuid(), active: z.boolean() });
const nameReference = z.object({ id: z.uuid(), name: z.string() });
const author = z.object({ displayName: z.string() });
export const brandRecord = row.extend({ name: z.string() });
export const modelRecord = row.extend({
  name: z.string(),
  description: z.string().nullable(),
  brandId: z.uuid(),
  brand: nameReference,
});
export const variantRecord = row.extend({
  modelId: z.uuid(),
  model: nameReference.extend({ brand: nameReference }),
  size: z.number().int(),
  color: z.string().nullable(),
  sku: z.string(),
  salePriceUsd: z.string(),
  lowStockThreshold: z.number().int().nullable(),
});
export const contactRecord = row.extend({
  name: z.string(),
  document: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
});
export const accountRecord = row.extend({
  name: z.string(),
  currencyCode: z.string(),
  kind: accountKindSchema,
});
export const rateRecord = row.extend({
  currencyCode: z.string(),
  unitsPerUsd: z.string(),
  effectiveAt: date,
  createdAt: date,
  createdBy: author,
  archivedAt: date.nullable(),
  replacesId: z.uuid().nullable(),
});
export const userRecord = row.extend({
  email: z.string(),
  displayName: z.string(),
  role: z.object({ code: z.string(), label: z.string() }),
  mustChangePassword: z.boolean(),
});
export const currencyRecord = currencyInput.extend({ code: z.string() });
export const roleRecord = financialPermissionsInput.extend({ code: z.string(), label: z.string() });
export const shopRecord = shopInput;
export const auditRecord = z.object({
  id: z.uuid(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  user: author.nullable(),
  createdAt: date,
  before: z.unknown(),
  after: z.unknown(),
});

export const resourceRecords = {
  brands: brandRecord,
  models: modelRecord,
  variants: variantRecord,
  customers: contactRecord,
  suppliers: contactRecord,
  accounts: accountRecord,
  rates: rateRecord,
  users: userRecord,
};
