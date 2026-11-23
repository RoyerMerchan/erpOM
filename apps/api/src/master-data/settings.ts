import {
  currencyCodeSchema,
  currencyInput,
  financialPermissionsInput,
  roleCodeSchema,
  shopInput,
} from '@max-sport/shared';
import { json, Router } from 'express';
import { writeAudit } from '../audit/write.js';
import { sessionActor } from '../auth/session.js';
import type { SessionSecurity } from '../auth/session.js';
import type { Database } from '../database.js';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { validate } from '../http/validation.js';
import { masterNotFound } from './catalog.js';

const shopSelect = {
  name: true,
  timezone: true,
  logoUrl: true,
  lowStockThreshold: true,
} satisfies Prisma.ShopSettingsSelect;
const currencySelect = {
  code: true,
  name: true,
  minorUnits: true,
  active: true,
} satisfies Prisma.CurrencySelect;
const roleSelect = {
  id: true,
  code: true,
  label: true,
  permissions: { select: { permission: { select: { code: true } } } },
} satisfies Prisma.RoleSelect;

function financialFlags(role: Prisma.RoleGetPayload<{ select: typeof roleSelect }>) {
  const codes = new Set(role.permissions.map(({ permission }) => permission.code));
  return { costs: codes.has('costs.read'), profits: codes.has('profits.read') };
}

export function createSettingsRouter(database: Database, security: SessionSecurity) {
  const router = Router();
  const body = json({ limit: '16kb' });

  router.get('/shop', ...security.allow('shop.read'), async (_request, response) => {
    const shop = await database.shopSettings.findUnique({ where: { id: 1 }, select: shopSelect });
    if (!shop) throw masterNotFound();
    response.json(shop);
  });

  router.put(
    '/shop',
    security.requireOrigin,
    ...security.allow('shop.update'),
    body,
    async (request, response) => {
      const input = validate(shopInput, request.body);
      const actor = sessionActor(response);
      const shop = await database.$transaction(
        async (tx) => {
          const previous = await tx.shopSettings.findUnique({
            where: { id: 1 },
            select: shopSelect,
          });
          if (!previous) throw masterNotFound();
          const updated = await tx.shopSettings.update({
            where: { id: 1 },
            data: input,
            select: shopSelect,
          });
          await writeAudit(tx, actor.id, {
            action: 'shop.update',
            entity: 'ShopSettings',
            entityId: '1',
            before: { ...previous, logoUrl: Boolean(previous.logoUrl) },
            after: { ...updated, logoUrl: Boolean(updated.logoUrl) },
          });
          return updated;
        },
        { isolationLevel: 'Serializable' },
      );
      response.json(shop);
    },
  );

  router.get('/currencies', ...security.allow('currencies.read'), async (_request, response) => {
    response.json(
      await database.currency.findMany({ orderBy: { code: 'asc' }, select: currencySelect }),
    );
  });

  router.put(
    '/currencies/:code',
    security.requireOrigin,
    ...security.allow('currencies.update'),
    body,
    async (request, response) => {
      const code = validate(currencyCodeSchema, request.params.code);
      const input = validate(currencyInput, request.body);
      if (code === 'USD' && (!input.active || input.minorUnits !== 2)) {
        throw new HttpError(
          400,
          'BASE_CURRENCY',
          'USD debe permanecer activa y usar dos decimales.',
        );
      }

      const actor = sessionActor(response);
      const currency = await database.$transaction(
        async (tx) => {
          const previous = await tx.currency.findUnique({
            where: { code },
            select: currencySelect,
          });
          if (!previous) throw masterNotFound();
          const updated = await tx.currency.update({
            where: { code },
            data: input,
            select: currencySelect,
          });
          await writeAudit(tx, actor.id, {
            action: 'currencies.update',
            entity: 'Currency',
            entityId: code,
            before: previous,
            after: updated,
          });
          return updated;
        },
        { isolationLevel: 'Serializable' },
      );
      response.json(currency);
    },
  );

  router.get('/roles', ...security.allow('roles.read'), async (_request, response) => {
    const roles = await database.role.findMany({
      where: { code: { in: roleCodeSchema.options } },
      orderBy: { label: 'asc' },
      select: roleSelect,
    });
    response.json(
      roles.map((role) => ({ code: role.code, label: role.label, ...financialFlags(role) })),
    );
  });

  router.put(
    '/roles/:code/financial-permissions',
    security.requireOrigin,
    ...security.allow('roles.financial.update'),
    body,
    async (request, response) => {
      const code = validate(roleCodeSchema, request.params.code);
      if (code === 'ADMIN')
        throw new HttpError(
          409,
          'ADMIN_FIXED',
          'El administrador conserva acceso a costos y utilidad.',
        );
      const input = validate(financialPermissionsInput, request.body);
      const actor = sessionActor(response);
      const updated = await database.$transaction(
        async (tx) => {
          const role = await tx.role.findUnique({ where: { code }, select: roleSelect });
          if (!role) throw masterNotFound();
          const before = financialFlags(role);
          const permissionSpecs = [
            { code: 'costs.read', enabled: input.costs },
            { code: 'profits.read', enabled: input.profits },
          ];
          for (const { code, enabled } of permissionSpecs) {
            const permission = await tx.permission.findUniqueOrThrow({
              where: { code },
              select: { id: true },
            });
            const link = { roleId: role.id, permissionId: permission.id };
            if (enabled)
              await tx.rolePermission.upsert({
                where: { roleId_permissionId: link },
                create: link,
                update: {},
              });
            else await tx.rolePermission.deleteMany({ where: link });
          }
          await writeAudit(tx, actor.id, {
            action: 'roles.financial.update',
            entity: 'Role',
            entityId: role.id,
            before,
            after: input,
          });
          return { code: role.code, label: role.label, ...input };
        },
        { isolationLevel: 'Serializable' },
      );
      response.json(updated);
    },
  );

  return router;
}
