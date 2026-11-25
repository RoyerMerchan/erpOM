import { z } from 'zod';
import { permissionSchema } from './access.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'El correo es demasiado largo.')
  .pipe(z.email('Ingresa un correo electrónico válido.'));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'El usuario debe tener al menos 3 caracteres.')
  .max(40, 'El usuario debe tener hasta 40 caracteres.')
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    'Empieza el usuario con una letra o número. Usa letras, números, puntos, guiones o guiones bajos.',
  );

export const passwordSchema = z
  .string()
  .min(1, 'Ingresa tu contraseña.')
  .max(128, 'La contraseña es demasiado larga.');
export const newPasswordMinLength = 6;
export const newPasswordSchema = passwordSchema.min(
  newPasswordMinLength,
  `Usa al menos ${newPasswordMinLength} caracteres.`,
);

export const loginSchema = z.object({ username: usernameSchema, password: passwordSchema });
export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    username: usernameSchema,
    email: z.email(),
    displayName: z.string(),
    role: z.object({ code: z.string(), label: z.string() }),
    permissions: z.array(permissionSchema),
    mustChangePassword: z.boolean(),
  }),
});

export type LoginInput = z.input<typeof loginSchema>;
export type SessionUser = z.output<typeof sessionResponseSchema>['user'];
