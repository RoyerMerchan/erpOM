import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Ingresa un correo electrónico válido.'));

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Ingresa tu contraseña.')
    .max(128, 'La contraseña es demasiado larga.'),
});

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    role: z.object({ code: z.string(), label: z.string() }),
  }),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const livenessSchema = z.object({ status: z.literal('ok') });
export const readinessSchema = z.object({ status: z.literal('ready') });

export type LoginInput = z.input<typeof loginSchema>;
export type SessionUser = z.output<typeof sessionResponseSchema>['user'];
