import { contactInput } from '@max-sport/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import type { CatalogDefinition } from './catalog.js';
import { buildPage, filterActive, insensitive, pageArgs } from './catalog.js';

const select = {
  id: true,
  name: true,
  document: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  active: true,
} satisfies Prisma.CustomerSelect & Prisma.SupplierSelect;
type Contact = Prisma.CustomerGetPayload<{ select: typeof select }>;
type ContactInput = z.output<typeof contactInput>;
type ContactTextMatch = { contains?: string; equals?: string; mode: 'insensitive' };
type ContactWhere = {
  id?: { not: string };
  name?: ContactTextMatch;
  document?: ContactTextMatch;
  phone?: ContactTextMatch;
  email?: ContactTextMatch;
  active?: boolean;
  OR?: ContactWhere[];
};
type ContactDelegate = {
  findFirst(args: { where: ContactWhere; select: { id: true } }): Promise<{ id: string } | null>;
  findUnique(args: { where: { id: string }; select: typeof select }): Promise<Contact | null>;
  findMany(args: {
    where: ContactWhere;
    skip: number;
    take: number;
    orderBy: { name?: 'asc'; id?: 'asc' }[];
    select: typeof select;
  }): Promise<Contact[]>;
  create(args: { data: ContactInput; select: typeof select }): Promise<Contact>;
  update(args: {
    where: { id: string };
    data: ContactInput | { active: boolean };
    select: typeof select;
  }): Promise<Contact>;
  count(args: { where: ContactWhere }): Promise<number>;
};

export function contacts(
  entity: 'Customer' | 'Supplier',
  contact: (database: Prisma.TransactionClient) => ContactDelegate,
): CatalogDefinition<ContactInput, Contact> {
  async function ensureUniqueDocument(
    db: Prisma.TransactionClient,
    document: string | null,
    id?: string,
  ) {
    if (!document) return;
    const duplicate = await contact(db).findFirst({
      where: {
        ...(id ? { id: { not: id } } : {}),
        document: { equals: document, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate)
      throw new HttpError(409, 'DOCUMENT_EXISTS', 'Ya existe un registro con ese documento.');
  }

  return {
    entity,
    schema: contactInput,
    list(db, query) {
      const where: ContactWhere = {
        ...filterActive(query.status),
        ...(query.q
          ? {
              OR: [
                { name: insensitive(query.q) },
                { document: insensitive(query.q) },
                { phone: insensitive(query.q) },
                { email: insensitive(query.q) },
              ],
            }
          : {}),
      };
      return buildPage(
        contact(db).findMany({
          where,
          ...pageArgs(query),
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select,
        }),
        contact(db).count({ where }),
      );
    },
    find: (db, id) => contact(db).findUnique({ where: { id }, select }),
    async create(db, input) {
      await ensureUniqueDocument(db, input.document);
      return contact(db).create({ data: input, select });
    },
    async update(db, id, input) {
      await ensureUniqueDocument(db, input.document, id);
      return contact(db).update({ where: { id }, data: input, select });
    },
    setActive: (db, id, active) => contact(db).update({ where: { id }, data: { active }, select }),
    audit: ({ active, document, phone, email, address, notes }) => ({
      active,
      hasDocument: Boolean(document),
      hasPhone: Boolean(phone),
      hasEmail: Boolean(email),
      hasAddress: Boolean(address),
      hasNotes: Boolean(notes),
    }),
  };
}
