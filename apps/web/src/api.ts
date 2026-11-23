import {
  apiErrorSchema,
  livenessSchema,
  readinessSchema,
  sessionResponseSchema,
} from '@max-sport/shared';
import type { LoginInput } from '@max-sport/shared';
import type { ZodType } from 'zod';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request(path: string, options: Pick<RequestInit, 'method' | 'body'> = {}) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new ApiRequestError('No se pudo conectar con la API. Intenta de nuevo.');
  });

  if (!response.ok) {
    const payload = apiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiRequestError(
      payload.success ? payload.data.error.message : 'La API no pudo completar la solicitud.',
      response.status,
      payload.success ? payload.data.error.code : undefined,
    );
  }
  return response;
}

async function readJson<T>(
  path: string,
  schema: ZodType<T>,
  options?: Pick<RequestInit, 'method' | 'body'>,
) {
  const response = await request(path, options);
  const result = schema.safeParse(await response.json().catch(() => null));
  if (!result.success) {
    throw new ApiRequestError('La API devolvió una respuesta inesperada.', response.status);
  }
  return result.data;
}

export function login(input: LoginInput) {
  return readJson('/auth/login', sessionResponseSchema, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getSession() {
  return readJson('/auth/me', sessionResponseSchema);
}

export async function logout() {
  await request('/auth/logout', { method: 'POST' });
}

export function checkLiveness() {
  return readJson('/health/live', livenessSchema);
}

export function checkReadiness() {
  return readJson('/health/ready', readinessSchema);
}
