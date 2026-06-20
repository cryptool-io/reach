import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { authProject, json, unauthorized } from '$lib/apiAuth';

type ProspectLike = { id: string; name: string; email: string; company: string; role: string; stage: string; tags: string; linkedinUrl: string };
function pub(p: ProspectLike) {
  return { id: p.id, name: p.name, email: p.email, company: p.company, role: p.role, stage: p.stage, tags: p.tags, linkedin: p.linkedinUrl };
}

// GET /api/v1/prospects?limit=100 — list prospects (most recently updated first).
export const GET: RequestHandler = async ({ request, url }) => {
  const projectId = await authProject(request);
  if (!projectId) return unauthorized();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
  const prospects = await db.prospect.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' }, take: limit });
  return json({ count: prospects.length, prospects: prospects.map(pub) });
};

// POST /api/v1/prospects — upsert one prospect or a {prospects:[...]} batch, keyed by email.
export const POST: RequestHandler = async ({ request }) => {
  const projectId = await authProject(request);
  if (!projectId) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const b = body as { prospects?: unknown[] } & Record<string, unknown>;
  const items = (Array.isArray(body) ? body : Array.isArray(b?.prospects) ? b.prospects : [body]) as Record<string, unknown>[];

  let created = 0;
  let updated = 0;
  const results: unknown[] = [];
  for (const it of items) {
    const email = String(it.email || '').trim().toLowerCase();
    if (!email) {
      results.push({ error: 'email required', input: it });
      continue;
    }
    const existing = await db.prospect.findFirst({ where: { projectId, email } });
    const str = (k: string, fallback: string) => (it[k] != null ? String(it[k]) : fallback);
    const data = {
      name: str('name', existing?.name ?? ''),
      company: str('company', existing?.company ?? ''),
      role: str('role', existing?.role ?? ''),
      email,
      linkedinUrl: it.linkedin != null ? String(it.linkedin) : str('linkedinUrl', existing?.linkedinUrl ?? ''),
      tags: str('tags', existing?.tags ?? '')
    };
    if (existing) {
      const p = await db.prospect.update({ where: { id: existing.id }, data });
      updated++;
      results.push(pub(p));
    } else {
      const p = await db.prospect.create({ data: { projectId, ...data } });
      created++;
      results.push(pub(p));
    }
  }
  return json({ created, updated, prospects: results });
};
