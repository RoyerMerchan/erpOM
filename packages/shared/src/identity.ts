import { z } from 'zod';
import { permissionSchema } from './access.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Ingresa un correo electrónico válido.'));

export const passwordSchema = z
  .string()
  .min(1, 'Ingresa tu contraseña.')
  .max(128, 'La contraseña es demasiado larga.');
export const newPasswordSchema = passwordSchema.min(15, 'Usa al menos 15 caracteres.');

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string(),
    role: z.object({ code: z.string(), label: z.string() }),
    permissions: z.array(permissionSchema),
    mustChangePassword: z.boolean(),
  }),
});

export type LoginInput = z.input<typeof loginSchema>;
export type SessionUser = z.output<typeof sessionResponseSchema>['user'];
