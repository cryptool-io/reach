import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail, redirect } from '@sveltejs/kit';
import { parseFieldSchema } from '$lib/presets';
import { STARTER_INVESTORS } from '$lib/starter-investors';
import { buildWhere, buildOrderBy } from '$lib/prospect-filter';
import { STAGES } from '$lib/types';
import { enrollMany } from '$lib/campaigns/engine';
import { verifyBatch, type EmailStatus } from '$lib/verifyEmail';

const PAGE_SIZE = 100;

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.activeProjectId)
    return {
      prospects: [], stage: null, fields: [], preset: 'blank', campaigns: [] as { id: string; name: string }[],
      total: 0, page: 1, pageSize: PAGE_SIZE, q: '',
      filters: { field: 'name', op: 'contains', val: '', channels: [] as string[], camp: '', cstatus: '', contacted: '', tag: '', sort: 'updatedAt', dir: 'desc' }
    };

  const sp = url.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
  const where = buildWhere(locals.activeProjectId, sp);
  const orderBy = buildOrderBy(sp);

  const [prospects, total, project, campaigns] = await Promise.all([
    db.prospect.findMany({ where, orderBy, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    db.prospect.count({ where }),
    db.project.findUnique({ where: { id: locals.activeProjectId } }),
    db.campaign.findMany({ where: { projectId: locals.activeProjectId }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' } })
  ]);

  return {
    prospects,
    stage: sp.get('stage') || null,
    fields: parseFieldSchema(project?.fieldSchemaJson ?? '[]'),
    preset: project?.preset ?? 'blank',
    campaigns,
    total,
    page,
    pageSize: PAGE_SIZE,
    q: sp.get('q') ?? '',
    filters: {
      field: sp.get('f') ?? 'name',
      op: sp.get('op') ?? 'contains',
      val: sp.get('v') ?? '',
      channels: sp.getAll('ch'),
      camp: sp.get('camp') ?? '',
      cstatus: sp.get('cstatus') ?? '',
      contacted: sp.get('contacted') ?? '',
      tag: sp.get('tag') ?? '',
      sort: sp.get('sort') ?? 'updatedAt',
      dir: sp.get('dir') ?? 'desc'
    }
  };
};

/** WHERE for a bulk action: either the checked-row ids, or ALL rows matching the saved filter. */
function bulkWhere(projectId: string, f: FormData) {
  if (String(f.get('scope') ?? 'selected') === 'all') {
    return buildWhere(projectId, new URLSearchParams(String(f.get('filterQs') ?? '')));
  }
  const ids = f.getAll('id').map(String).filter(Boolean);
  return { projectId, id: { in: ids } };
}

/** Concrete id list (for actions that must enumerate rows — enroll, tag). Chunk-safe. */
async function bulkIds(projectId: string, f: FormData): Promise<string[]> {
  if (String(f.get('scope') ?? 'selected') === 'all') {
    const where = buildWhere(projectId, new URLSearchParams(String(f.get('filterQs') ?? '')));
    return (await db.prospect.findMany({ where, select: { id: true } })).map((r) => r.id);
  }
  return f.getAll('id').map(String).filter(Boolean);
}

export const actions: Actions = {
  // ── bulk actions (operate on checked rows OR all matching the filter) ──
  bulkEnroll: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const campaignId = String(f.get('campaignId') ?? '');
    if (!campaignId) return fail(400, { error: 'pick a campaign' });
    const ids = await bulkIds(locals.activeProjectId, f);
    if (!ids.length) return fail(400, { error: 'no prospects selected' });
    const added = await enrollMany(campaignId, ids);
    return { ok: 'bulk', message: `Enrolled ${added} prospect(s)${added < ids.length ? ` (${ids.length - added} already in)` : ''}.` };
  },

  bulkStage: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const stage = String(f.get('stage') ?? '');
    if (!STAGES.includes(stage as (typeof STAGES)[number])) return fail(400, { error: 'bad stage' });
    const res = await db.prospect.updateMany({ where: bulkWhere(locals.activeProjectId, f), data: { stage } });
    return { ok: 'bulk', message: `Moved ${res.count} prospect(s) to ${stage}.` };
  },

  bulkTag: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const tag = String(f.get('tag') ?? '').trim().toLowerCase();
    if (!tag) return fail(400, { error: 'enter a tag' });
    const ids = await bulkIds(locals.activeProjectId, f);
    if (!ids.length) return fail(400, { error: 'no prospects selected' });
    // append tag where missing (read-modify-write in chunks)
    let n = 0;
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const rows = await db.prospect.findMany({
        where: { id: { in: ids.slice(i, i + CHUNK) } },
        select: { id: true, tags: true }
      });
      for (const r of rows) {
        const set = new Set(r.tags.split(',').map((t) => t.trim()).filter(Boolean));
        if (!set.has(tag)) {
          set.add(tag);
          await db.prospect.update({ where: { id: r.id }, data: { tags: [...set].join(',') } });
          n++;
        }
      }
    }
    return { ok: 'bulk', message: `Tagged ${n} prospect(s) "${tag}".` };
  },

  bulkDelete: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const res = await db.prospect.deleteMany({ where: bulkWhere(locals.activeProjectId, f) });
    return { ok: 'bulk', message: `Deleted ${res.count} prospect(s).` };
  },

  // List hygiene: verify the selection's emails (syntax + MX). Processes the not-yet-verified
  // ones first, capped per run so a huge list chews through over a few clicks.
  bulkVerify: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const ids = await bulkIds(locals.activeProjectId, f);
    if (!ids.length) return fail(400, { error: 'no prospects selected' });
    const CAP = 1500;
    const rows = await db.prospect.findMany({
      where: { id: { in: ids }, email: { not: '' }, emailStatus: { in: ['', 'unknown'] } },
      select: { id: true, email: true },
      take: CAP
    });
    if (!rows.length) return { ok: 'bulk', message: 'Nothing to verify — selected prospects are already verified (or have no email).' };
    const results = await verifyBatch(rows);
    const byStatus: Record<EmailStatus, string[]> = { valid: [], invalid: [], risky: [], unknown: [] };
    for (const [id, status] of results) byStatus[status].push(id);
    for (const [status, idlist] of Object.entries(byStatus)) {
      for (let j = 0; j < idlist.length; j += 500) {
        await db.prospect.updateMany({ where: { id: { in: idlist.slice(j, j + 500) } }, data: { emailStatus: status } });
      }
    }
    const remaining = Math.max(0, ids.length - rows.length);
    return {
      ok: 'bulk',
      message:
        `Verified ${rows.length}: ${byStatus.valid.length} valid, ${byStatus.risky.length} risky (role), ${byStatus.invalid.length} invalid.` +
        (remaining ? ` ${remaining} more queued — run Verify again to continue.` : '') +
        ` Invalid addresses are skipped automatically at send.`
    };
  },

  create: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400, { error: 'no active project' });
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'name required' });

    // collect client-defined custom fields into customJson
    const project = await db.project.findUniqueOrThrow({ where: { id: locals.activeProjectId } });
    const custom: Record<string, string> = {};
    for (const field of parseFieldSchema(project.fieldSchemaJson)) {
      const v = String(f.get(`custom.${field.key}`) ?? '').trim();
      if (v) custom[field.key] = v;
    }

    const p = await db.prospect.create({
      data: {
        projectId: locals.activeProjectId,
        name,
        company: String(f.get('company') ?? ''),
        role: String(f.get('role') ?? ''),
        linkedinUrl: String(f.get('linkedinUrl') ?? ''),
        email: String(f.get('email') ?? ''),
        xHandle: String(f.get('xHandle') ?? ''),
        telegram: String(f.get('telegram') ?? ''),
        discord: String(f.get('discord') ?? ''),
        customJson: JSON.stringify(custom)
      }
    });
    throw redirect(303, `/prospects/${p.id}`);
  },

  importCsv: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400, { error: 'no active project' });
    const f = await request.formData();
    const csv = String(f.get('csv') ?? '').trim();
    if (!csv) return fail(400, { error: 'csv required' });

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { imported: 0 };
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

    // Recognized core columns (+ aliases) map to first-class prospect fields.
    // Everything else (fund_type, ticket_min, thesis, source, …) is preserved in customJson,
    // so the importer stays universal across investor / sales / recruiting lists.
    const CORE: Record<string, string> = {
      name: 'name', full_name: 'name', fullname: 'name',
      company: 'company', firm: 'company', fund: 'company',
      role: 'role', title: 'role', position: 'role',
      email: 'email',
      linkedin: 'linkedinUrl', linkedin_url: 'linkedinUrl', linkedinurl: 'linkedinUrl',
      x: 'xHandle', twitter: 'xHandle', x_handle: 'xHandle', xhandle: 'xHandle',
      telegram: 'telegram',
      discord: 'discord'
    };

    const customKeys = new Set<string>();
    const rows = lines.slice(1).map((l) => {
      const cells = parseCsvLine(l);
      const fields: Record<string, string> = {
        name: '', company: '', role: '', email: '',
        linkedinUrl: '', xHandle: '', telegram: '', discord: ''
      };
      const custom: Record<string, string> = {};
      header.forEach((h, i) => {
        const val = (cells[i] ?? '').trim();
        if (!val) return;
        const core = CORE[h];
        if (core) fields[core] = val;
        else if (h) {
          custom[h] = val;
          customKeys.add(h);
        }
      });
      return {
        projectId: locals.activeProjectId!,
        name: fields.name,
        company: fields.company,
        role: fields.role,
        email: fields.email,
        linkedinUrl: fields.linkedinUrl,
        xHandle: fields.xHandle,
        telegram: fields.telegram,
        discord: fields.discord,
        customJson: JSON.stringify(custom)
      };
    }).filter((r) => r.name);

    if (rows.length === 0) return { imported: 0, error: 'No rows with a name column' };
    await db.prospect.createMany({ data: rows });
    return { imported: rows.length, customFields: [...customKeys] };
  },

  loadStarter: async ({ locals }) => {
    if (!locals.activeProjectId) return fail(400);
    await db.prospect.createMany({
      data: STARTER_INVESTORS.map((s) => ({
        projectId: locals.activeProjectId!,
        name: s.company, // firm as the record; find the right partner via Sourcer/enrichment
        company: s.company,
        role: 'Partner (verify contact)',
        stage: 'new',
        customJson: JSON.stringify({ fund_type: s.focus, geo: s.geo, website: s.website, source: 'starter-list' })
      }))
    });
    return { imported: STARTER_INVESTORS.length, starter: true };
  }
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"') {
        inQ = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}
