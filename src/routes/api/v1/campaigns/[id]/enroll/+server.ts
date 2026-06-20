import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { authProject, json, unauthorized } from '$lib/apiAuth';
import { enrollMany } from '$lib/campaigns/engine';

// POST /api/v1/campaigns/<id>/enroll  body: { emails: ["a@x.com", ...] }
// Enrolls existing prospects (matched by email) into the campaign.
export const POST: RequestHandler = async ({ request, params }) => {
  const projectId = await authProject(request);
  if (!projectId) return unauthorized();
  const campaign = await db.campaign.findFirst({ where: { id: params.id, projectId } });
  if (!campaign) return json({ error: 'campaign not found in this project' }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const raw = (body as { emails?: unknown[] })?.emails;
  const emails = (Array.isArray(raw) ? raw : []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return json({ error: 'body.emails (array of addresses) is required' }, 400);

  const prospects = await db.prospect.findMany({ where: { projectId, email: { in: emails } }, select: { id: true, email: true } });
  const added = await enrollMany(campaign.id, prospects.map((p) => p.id));
  const found = new Set(prospects.map((p) => p.email.toLowerCase()));
  const notFound = emails.filter((e) => !found.has(e));
  return json({ added, matched: prospects.length, notFound });
};
