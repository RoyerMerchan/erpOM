import { changePasswordInput, loginSchema } from '@max-sport/shared';
import { json, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { writeAudit } from '../audit/write.js';
import type { Database } from '../database.js';
import { HttpError } from '../http/errors.js';
import { validate } from '../http/validation.js';
import { hashPassword, verifyPassword } from './password.js';
import { identitySelect, lockUser, sessionActor, toSessionUser } from './session.js';
import type { SessionSecurity } from './session.js';

const invalidCredentials = () =>
  new HttpError(401, 'INVALID_CREDENTIALS', 'El correo o la contraseña no son correctos.');

function authLimit(limit: number, code: string) {
  return rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new HttpError(429, code, 'Demasiados intentos. Vuelve a intentar en unos minutos.'));
    },
  });
}

export function createAuthRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  const body = json({ limit: '16kb' });
  const loginAccount = authLimit(12, 'LOGIN_LIMIT');
  const changeCredentials = authLimit(8, 'PASSWORD_LIMIT');

  router.post('/login', security.requireOrigin, loginAccount, body, async (request, response) => {
    const { email, password } = validate(loginSchema, request.body);
    const user = await database.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, active: true },
    });
    const matches = await verifyPassword(password, user?.passwordHash);
    if (!user?.active || !matches) throw invalidCredentials();

    const { now, token, tokenHash, expiresAt } = security.newSession();
    const previousHash = security.readTokenHash(request);
    const identity = await database.$transaction(async (transaction) => {
      await lockUser(transaction, user.id);
      const current = await transaction.user.findUnique({
        where: { id: user.id },
        select: { ...identitySelect, active: true, passwordHash: true },
      });
      if (
        !current?.active ||
        current.passwordHash !== user.passwordHash ||
        current.email !== email
      ) {
        throw invalidCredentials();
      }

      await transaction.userSession.deleteMany({
        where: {
          OR: [
            { userId: user.id, expiresAt: { lte: now } },
            ...(previousHash ? [{ tokenHash: previousHash }] : []),
          ],
        },
      });
      await transaction.userSession.create({ data: { tokenHash, expiresAt, userId: current.id } });
      await writeAudit(transaction, current.id, {
        action: 'auth.login',
        entity: 'User',
        entityId: current.id,
      });
      return toSessionUser(current);
    });

    security.setCookie(response, token);
    response.json({ user: identity });
  });

  router.get('/me', security.authenticate, (_request, response) => {
    response.json({ user: sessionActor(response) });
  });

  router.post(
    '/password',
    security.requireOrigin,
    security.authenticate,
    changeCredentials,
    body,
    async (request, response) => {
      const { currentPassword, newPassword } = validate(changePasswordInput, request.body);
      const { id } = sessionActor(response);
      const tokenHash = security.readTokenHash(request);
      const existing = await database.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      });
      if (!(await verifyPassword(currentPassword, existing?.passwordHash))) {
        throw new HttpError(400, 'WRONG_PASSWORD', 'La contraseña actual no es correcta.');
      }

      const hash = await hashPassword(newPassword);
      await database.$transaction(async (transaction) => {
        await lockUser(transaction, id);
        const session =
          tokenHash &&
          (await transaction.userSession.findFirst({
            where: { tokenHash, userId: id, expiresAt: { gt: new Date() } },
            select: { tokenHash: true },
          }));
        if (!session) throw new HttpError(401, 'SESSION_REQUIRED', 'Inicia sesión para continuar.');

        const { count } = await transaction.user.updateMany({
          where: { id, active: true, passwordHash: existing?.passwordHash },
          data: { passwordHash: hash, mustChangePassword: false },
        });
        if (count !== 1)
          throw new HttpError(
            409,
            'SECURITY_CHANGED',
            'El acceso cambió. Vuelve a iniciar sesión.',
          );

        await transaction.userSession.deleteMany({ where: { userId: id } });
        await writeAudit(transaction, id, {
          action: 'auth.password.change',
          entity: 'User',
          entityId: id,
        });
      });

      security.clearCookie(response);
      response.status(204).end();
    },
  );

  router.post('/logout', security.requireOrigin, async (request, response) => {
    const tokenHash = security.readTokenHash(request);
    if (tokenHash) await database.userSession.deleteMany({ where: { tokenHash } });
    security.clearCookie(response);
    response.status(204).end();
  });

  return router;
}
