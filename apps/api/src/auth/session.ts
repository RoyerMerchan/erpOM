import { createHash, randomBytes } from 'node:crypto';
import { isPermissionCode } from '@max-sport/shared';
import type { PermissionCode, SessionUser } from '@max-sport/shared';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { RuntimeConfig } from '../config.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';

const sessionDurationMs = 8 * 60 * 60 * 1_000;

export const identitySelect = {
  id: true,
  email: true,
  displayName: true,
  mustChangePassword: true,
  role: {
    select: {
      code: true,
      label: true,
      permissions: { select: { permission: { select: { code: true } } } },
    },
  },
} satisfies Prisma.UserSelect;

export function toSessionUser(
  user: Prisma.UserGetPayload<{ select: typeof identitySelect }>,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: { code: user.role.code, label: user.role.label },
    permissions: user.role.permissions
      .map(({ permission }) => permission.code)
      .filter(isPermissionCode)
      .sort(),
    mustChangePassword: user.mustChangePassword,
  };
}

export function sessionActor(response: Response): SessionUser {
  const actor: SessionUser | undefined = response.locals.actor;
  if (!actor) throw new HttpError(401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.');
  return actor;
}

export async function lockUser(transaction: Prisma.TransactionClient, userId: string) {
  await transaction.$queryRaw`SELECT id FROM "users" WHERE id = ${userId}::uuid FOR UPDATE`;
}

export function createSessionSecurity(database: Database, config: RuntimeConfig) {
  const secure = config.NODE_ENV === 'production';
  const cookieName = secure ? '__Host-max_sport_session' : 'max_sport_session';
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'lax', secure, path: '/' };

  function readTokenHash(request: Request) {
    const token: unknown = request.cookies?.[cookieName];
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
      ? createHash('sha256').update(token).digest('hex')
      : undefined;
  }

  function newSession() {
    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    return {
      now,
      token,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(now.getTime() + sessionDurationMs),
    };
  }

  const requireOrigin: RequestHandler = (request, _response, next) => {
    if (request.get('Origin') !== config.APP_ORIGIN) {
      throw new HttpError(
        403,
        'ORIGIN_REJECTED',
        'La solicitud proviene de un origen no autorizado.',
      );
    }
    next();
  };

  const authenticate: RequestHandler = async (request, response, next) => {
    const tokenHash = readTokenHash(request);
    const session =
      tokenHash &&
      (await database.userSession.findFirst({
        where: { tokenHash, expiresAt: { gt: new Date() }, user: { active: true } },
        select: { user: { select: identitySelect } },
      }));
    if (!session) throw new HttpError(401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.');
    response.locals.actor = toSessionUser(session.user);
    next();
  };

  function allow(...permissions: PermissionCode[]) {
    const authorize: RequestHandler = (_request, response, next) => {
      const user = sessionActor(response);
      if (user.mustChangePassword) {
        throw new HttpError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Cambia tu contraseña temporal para continuar.',
        );
      }
      if (!permissions.every((permission) => user.permissions.includes(permission))) {
        throw new HttpError(403, 'PERMISSION_DENIED', 'Tu rol no permite realizar esta acción.');
      }
      next();
    };
    return [authenticate, authorize] as const;
  }

  return {
    requireOrigin,
    authenticate,
    allow,
    readTokenHash,
    newSession,
    setCookie(response: Response, token: string) {
      response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDurationMs });
    },
    clearCookie(response: Response) {
      response.clearCookie(cookieName, cookieOptions);
    },
  };
}

export type SessionSecurity = ReturnType<typeof createSessionSecurity>;
