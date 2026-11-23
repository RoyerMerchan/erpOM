import { createHash, randomBytes } from 'node:crypto';
import { loginSchema, sessionResponseSchema } from '@max-sport/shared';
import cookieParser from 'cookie-parser';
import { json, Router } from 'express';
import type { CookieOptions, Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { RuntimeConfig } from '../config.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { verifyPassword } from './password.js';

const sessionDurationMs = 8 * 60 * 60 * 1_000;

const publicUser = {
  id: true,
  displayName: true,
  email: true,
  role: { select: { code: true, label: true } },
} as const;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readToken(request: Request, cookieName: string): string | undefined {
  const token: unknown = request.cookies[cookieName];
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function createAuthRouter(database: Database, config: RuntimeConfig) {
  const router = Router();
  const secure = config.NODE_ENV === 'production';
  const cookieName = secure ? '__Host-max_sport_session' : 'max_sport_session';
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'lax', secure, path: '/' };

  const requireOrigin: RequestHandler = (request, _response, next) => {
    if (request.get('Origin') !== config.APP_ORIGIN) {
      next(
        new HttpError(403, 'ORIGIN_REJECTED', 'La solicitud proviene de un origen no autorizado.'),
      );
      return;
    }
    next();
  };

  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new HttpError(
          429,
          'LOGIN_LIMIT',
          'Demasiados intentos. Vuelve a intentar en unos minutos.',
        ),
      );
    },
  });

  router.use(cookieParser());

  router.post(
    '/login',
    requireOrigin,
    loginLimit,
    json({ limit: '16kb' }),
    async (request, response) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          'INVALID_INPUT',
          parsed.error.issues[0]?.message ?? 'Revisa los datos.',
        );
      }

      const { email, password } = parsed.data;
      const user = await database.user.findUnique({
        where: { email },
        select: { ...publicUser, passwordHash: true, active: true },
      });

      const passwordMatches = await verifyPassword(password, user?.passwordHash);
      if (!user?.active || !passwordMatches) {
        throw new HttpError(
          401,
          'INVALID_CREDENTIALS',
          'El correo o la contraseña no son correctos.',
        );
      }

      const now = new Date();
      const token = randomBytes(32).toString('base64url');
      const previousToken = readToken(request, cookieName);
      await database.$transaction([
        database.userSession.deleteMany({
          where: {
            OR: [
              { expiresAt: { lte: now } },
              ...(previousToken ? [{ tokenHash: hashToken(previousToken) }] : []),
            ],
          },
        }),
        database.userSession.create({
          data: {
            tokenHash: hashToken(token),
            userId: user.id,
            expiresAt: new Date(now.getTime() + sessionDurationMs),
          },
        }),
        database.auditLog.create({
          data: { action: 'auth.login', entity: 'User', entityId: user.id, userId: user.id },
        }),
      ]);

      response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDurationMs });
      response.json(sessionResponseSchema.parse({ user }));
    },
  );

  router.get('/me', async (request, response) => {
    const token = readToken(request, cookieName);
    if (!token) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.');
    }

    const session = await database.userSession.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() }, user: { active: true } },
      select: { user: { select: publicUser } },
    });

    if (!session) {
      throw new HttpError(401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.');
    }
    response.json(session);
  });

  router.post('/logout', requireOrigin, async (request, response) => {
    const token = readToken(request, cookieName);
    if (token) await database.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    response.clearCookie(cookieName, cookieOptions).status(204).end();
  });

  return router;
}
