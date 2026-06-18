import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/db';
import { buildWhere } from '$lib/prospect-filter';
import { parseFieldSchema } from '$lib/presets';

const CORE = ['name', 'company', 'role', 'email', 'linkedinUrl', 'xHandle', 'telegram', 'discord', 'stage', 'tags'] as const;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /prospects/export?<same filter params> → CSV of all matching prospects (core + custom + tags).
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.activeProjectId) throw error(400, 'no active project');
  const where = buildWhere(locals.activeProjectId, url.searchParams);
  const project = await db.project.findUnique({ where: { id: locals.activeProjectId } });
  const customKeys = parseFieldSchema(project?.fieldSchemaJson ?? '[]').map((f) => f.key);

  const header = [...CORE, ...customKeys.map((k) => `custom.${k}`)];
  const lines = [header.join(',')];

  const BATCH = 1000;
  let cursor: string | undefined;
  // keyset paginate by id to stream the whole filtered set without loading 17k at once
  for (;;) {
    const batch = await db.prospect.findMany({
      where,
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (batch.length === 0) break;
    for (const p of batch) {
      let custom: Record<string, unknown> = {};
      try {
        custom = JSON.parse(p.customJson || '{}');
      } catch {
        custom = {};
      }
      const row = [
        p.name, p.company, p.role, p.email, p.linkedinUrl, p.xHandle, p.telegram, p.discord, p.stage, p.tags,
        ...customKeys.map((k) => custom[k] ?? '')
      ];
      lines.push(row.map(csvCell).join(','));
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH) break;
  }

  const slug = project?.slug ?? 'prospects';
  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}-prospects.csv"`
    }
  });
};
