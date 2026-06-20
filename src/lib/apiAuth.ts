// Public REST API auth: a project-scoped bearer token (Authorization: Bearer <token> or x-api-key).
import { db } from '$lib/db';
import crypto from 'node:crypto';

export function generateApiToken(): string {
  return 'rk_' + crypto.randomBytes(24).toString('hex');
}

/** Resolve the project for a request's API token, or null when missing/invalid. */
export async function authProject(request: Request): Promise<string | null> {
  const h = request.headers.get('authorization') || '';
  const bearer = /^bearer\s+/i.test(h) ? h.replace(/^bearer\s+/i, '').trim() : '';
  const token = bearer || request.headers.get('x-api-key') || '';
  if (!token) return null;
  const row = await db.apiToken.findUnique({ where: { token } });
  if (!row) return null;
  db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return row.projectId;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

export function unauthorized(): Response {
  return json({ error: 'Invalid or missing API token. Pass Authorization: Bearer <token> or x-api-key.' }, 401);
}
