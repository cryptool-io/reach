import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { generateApiToken } from '$lib/apiAuth';
import { emitEvent, WEBHOOK_EVENTS, type WebhookEvent } from '$lib/webhooks';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
  const baseUrl = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!locals.activeProjectId) return { webhooks: [], tokens: [], events: WEBHOOK_EVENTS, baseUrl };
  const [webhooks, tokens] = await Promise.all([
    db.webhook.findMany({ where: { projectId: locals.activeProjectId }, orderBy: { createdAt: 'desc' } }),
    db.apiToken.findMany({ where: { projectId: locals.activeProjectId }, orderBy: { createdAt: 'desc' } })
  ]);
  // Never ship full tokens to the client — show a masked suffix only.
  const masked = tokens.map((t) => ({
    id: t.id, label: t.label, tail: t.token.slice(-4), lastUsedAt: t.lastUsedAt, createdAt: t.createdAt
  }));
  return { webhooks, tokens: masked, events: WEBHOOK_EVENTS, baseUrl };
};

export const actions: Actions = {
  addWebhook: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const url = String(f.get('url') ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return fail(400, { error: 'Enter a valid http(s) URL.' });
    const events = f.getAll('events').map(String).filter((e) => (WEBHOOK_EVENTS as string[]).includes(e));
    await db.webhook.create({
      data: {
        projectId: locals.activeProjectId,
        url,
        events: events.length && events.length < WEBHOOK_EVENTS.length ? events.join(',') : 'all',
        secret: String(f.get('secret') ?? '').trim()
      }
    });
    return { ok: 'webhook-add' };
  },

  toggleWebhook: async ({ request, locals }) => {
    const f = await request.formData();
    const w = await db.webhook.findUnique({ where: { id: String(f.get('id') ?? '') } });
    if (!w || w.projectId !== locals.activeProjectId) return fail(404);
    await db.webhook.update({ where: { id: w.id }, data: { active: !w.active } });
    return { ok: 'webhook-toggle' };
  },

  testWebhook: async ({ request, locals }) => {
    const f = await request.formData();
    const w = await db.webhook.findUnique({ where: { id: String(f.get('id') ?? '') } });
    if (!w || w.projectId !== locals.activeProjectId) return fail(404);
    const ev = (w.events === 'all' ? 'sent' : w.events.split(',')[0].trim()) as WebhookEvent;
    await emitEvent(w.projectId, ev, { test: true, message: 'Reach webhook test' });
    const after = await db.webhook.findUnique({ where: { id: w.id } });
    return { ok: 'webhook-test', detail: `Test fired (${ev}). Last status: ${after?.lastStatus || '—'}` };
  },

  removeWebhook: async ({ request, locals }) => {
    const f = await request.formData();
    const w = await db.webhook.findUnique({ where: { id: String(f.get('id') ?? '') } });
    if (w && w.projectId === locals.activeProjectId) await db.webhook.delete({ where: { id: w.id } }).catch(() => {});
    return { ok: 'webhook-del' };
  },

  addToken: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const token = generateApiToken();
    await db.apiToken.create({
      data: { projectId: locals.activeProjectId, token, label: String(f.get('label') ?? '').trim() || 'API token' }
    });
    // Returned once so the user can copy it — never retrievable again.
    return { ok: 'token-add', token };
  },

  removeToken: async ({ request, locals }) => {
    const f = await request.formData();
    const t = await db.apiToken.findUnique({ where: { id: String(f.get('id') ?? '') } });
    if (t && t.projectId === locals.activeProjectId) await db.apiToken.delete({ where: { id: t.id } }).catch(() => {});
    return { ok: 'token-del' };
  }
};
