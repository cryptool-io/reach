// Shared Woodpecker-style prospect filter → Prisma where + orderBy.
// Used by the prospects list load, bulk actions, and CSV export so they all agree.

import type { Prisma } from '@prisma/client';

const CORE_FIELDS = ['name', 'company', 'email', 'role', 'linkedinUrl'] as const;
export const CHAN_FIELD: Record<string, string> = {
  email: 'email',
  linkedin: 'linkedinUrl',
  x: 'xHandle',
  telegram: 'telegram',
  discord: 'discord'
};

function opFilter(op: string, val: string) {
  switch (op) {
    case 'starts':
      return { startsWith: val };
    case 'ends':
      return { endsWith: val };
    case 'is':
      return { equals: val };
    default:
      return { contains: val };
  }
}

export function buildWhere(projectId: string, sp: URLSearchParams): Prisma.ProspectWhereInput {
  const stage = sp.get('stage') ?? '';
  const q = (sp.get('q') ?? '').trim();
  const field = sp.get('f') ?? 'name';
  const op = sp.get('op') ?? 'contains';
  const val = (sp.get('v') ?? '').trim();
  const channels = sp.getAll('ch').filter((c) => CHAN_FIELD[c]);
  const camp = sp.get('camp') ?? '';
  const campStatus = sp.get('cstatus') ?? '';
  const contacted = sp.get('contacted') ?? '';
  const tag = (sp.get('tag') ?? '').trim();

  const AND: Prisma.ProspectWhereInput[] = [];

  if (q) {
    AND.push({
      OR: [
        { name: { contains: q } },
        { company: { contains: q } },
        { email: { contains: q } },
        { role: { contains: q } }
      ]
    });
  }

  if (val) {
    if ((CORE_FIELDS as readonly string[]).includes(field)) {
      AND.push({ [field]: opFilter(op, val) });
    } else if (field.startsWith('custom.')) {
      const key = field.slice('custom.'.length);
      if (op === 'is') AND.push({ customJson: { contains: `"${key}":"${val}"` } });
      else AND.push({ AND: [{ customJson: { contains: `"${key}"` } }, { customJson: { contains: val } }] });
    }
  }

  if (channels.length) AND.push({ OR: channels.map((c) => ({ [CHAN_FIELD[c]]: { not: '' } })) });
  if (tag) AND.push({ tags: { contains: tag.toLowerCase() } });

  if (camp) {
    AND.push({
      enrollments: { some: { campaignId: camp, ...(campStatus ? { status: campStatus } : {}) } }
    });
  }

  if (contacted === 'yes') AND.push({ conversations: { some: { messages: { some: { direction: 'out' } } } } });
  else if (contacted === 'no') AND.push({ conversations: { none: { messages: { some: { direction: 'out' } } } } });

  return { projectId, ...(stage ? { stage } : {}), ...(AND.length ? { AND } : {}) };
}

const SORTABLE = ['name', 'company', 'stage', 'score', 'createdAt', 'updatedAt'] as const;

export function buildOrderBy(sp: URLSearchParams): Prisma.ProspectOrderByWithRelationInput {
  const sort = sp.get('sort') ?? 'updatedAt';
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  const field = (SORTABLE as readonly string[]).includes(sort) ? sort : 'updatedAt';
  return { [field]: dir };
}
