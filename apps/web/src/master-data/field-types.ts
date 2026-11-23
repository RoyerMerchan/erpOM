export type FieldValue = string | number | boolean | null;
export type FormValues = Record<string, FieldValue>;
export type Option = { value: string | number; label: string };
export type Lookup = 'brands' | 'models' | 'currencies' | 'roles';
export type Field = {
  key: string;
  label: string;
  kind?: 'number' | 'select' | 'boolean' | 'date' | 'password' | 'textarea';
  nullable?: boolean;
  omitEmpty?: boolean;
  required?: boolean;
  numericText?: boolean;
  disabled?: boolean;
  autocomplete?: string;
  min?: number;
  max?: number;
  options?: Option[];
  lookup?: Lookup;
  defaultValue?: FieldValue;
  help?: string;
};

export function formPayload(fields: Field[], draft: FormValues) {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = draft[field.key];
      if ((value === '' || value == null) && field.omitEmpty) return [];
      if (value === '' && field.nullable) return [[field.key, null]];
      if (field.kind === 'date' && typeof value === 'string' && value) {
        const date = new Date(value);
        return [[field.key, Number.isNaN(date.getTime()) ? value : date.toISOString()]];
      }
      if (field.numericText && typeof value === 'string') {
        return [[field.key, value.replace(',', '.')]];
      }
      return [[field.key, value]];
    }),
  );
}

export function localDateInput(value: string | Date): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

export function nestedRow(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = row[key];
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
