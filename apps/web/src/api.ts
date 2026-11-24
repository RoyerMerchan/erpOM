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

let sessionExpired: (() => void) | undefined;

export function onSessionExpired(callback: () => void) {
  sessionExpired = callback;
}

async function request(
  path: string,
  options: Pick<RequestInit, 'method' | 'body'> = {},
  timeout = 10_000,
) {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(timeout),
  }).catch(() => {
    throw new ApiRequestError('No se pudo conectar con la API. Intenta de nuevo.');
  });

  if (!response.ok) {
    const payload = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (path !== '/auth/me' && payload.success && payload.data.error.code === 'SESSION_REQUIRED') {
      sessionExpired?.();
    }
    throw new ApiRequestError(
      payload.success ? payload.data.error.message : 'La API no pudo completar la solicitud.',
      response.status,
      payload.success ? payload.data.error.code : undefined,
    );
  }
  return response;
}

export async function downloadFile(path: string, filename: string, body?: unknown) {
  const response = await request(
    path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          body: JSON.stringify(body),
        },
    60_000,
  );
  const suggested = /(?:^|;)\s*filename=(?:"([a-z0-9_.-]+)"|([a-z0-9_.-]+))\s*(?:;|$)/i.exec(
    response.headers.get('Content-Disposition') ?? '',
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = suggested?.[1] ?? suggested?.[2] ?? filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function readJson<T>(
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

export function sendJson<T>(
  path: string,
  schema: ZodType<T>,
  input: unknown,
  method: 'POST' | 'PUT',
) {
  return readJson(path, schema, { method, body: JSON.stringify(input) });
}

export async function noContent(path: string, method: 'POST' | 'DELETE', input?: unknown) {
  await request(path, { method, body: input === undefined ? undefined : JSON.stringify(input) });
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
