import type { RequestHandler } from './$types';
import { authProject, json, unauthorized } from '$lib/apiAuth';
import { addSuppression } from '$lib/suppression';

// POST /api/v1/suppress  body: { email, reason? } — add an address to the project opt-out list.
export const POST: RequestHandler = async ({ request }) => {
  const projectId = await authProject(request);
  if (!projectId) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const email = String((body as { email?: unknown })?.email || '').trim();
  if (!email) return json({ error: 'body.email is required' }, 400);
  const reason = String((body as { reason?: unknown })?.reason || 'manual');
  await addSuppression(projectId, email, reason);
  return json({ ok: true, suppressed: email.toLowerCase(), reason });
};
