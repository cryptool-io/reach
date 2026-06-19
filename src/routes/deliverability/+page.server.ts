import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { projectCapacity, effectiveDailyLimit } from '$lib/mailboxes';
import { checkDomain, normalizeDomain } from '$lib/deliverability';

export const load: PageServerLoad = async ({ locals }) => {
  const empty = { domains: [], mailboxes: [], capacity: null, bounce: null, score: 0, project: null };
  if (!locals.activeProjectId) return empty;
  const project = await db.project.findUnique({ where: { id: locals.activeProjectId }, select: { name: true } });
  const rows = await db.mailbox.findMany({ where: { projectId: locals.activeProjectId } });
  const today = new Date().toISOString().slice(0, 10);
  const mailboxes = rows.map((mb) => ({
    id: mb.id, fromEmail: mb.fromEmail, label: mb.label, status: mb.status,
    warmupEnabled: mb.warmupEnabled, dailyLimit: mb.dailyLimit, effLimit: effectiveDailyLimit(mb),
    sentToday: mb.sentDate === today ? mb.sentToday : 0, lastError: mb.lastError
  }));

  const domainNames = [...new Set(rows.map((mb) => (mb.fromEmail.split('@')[1] || '').toLowerCase()).filter(Boolean))].slice(0, 12);
  const checks = await Promise.all(domainNames.map(checkDomain));
  const mbByDomain = (d: string) => mailboxes.filter((m) => m.fromEmail.toLowerCase().endsWith('@' + d)).length;
  const domains = checks.map((c) => ({ ...c, mailboxCount: mbByDomain(c.domain) }));

  const capacity = await projectCapacity(locals.activeProjectId);
  const [bounced, sent] = await Promise.all([
    db.campaignEnrollment.count({ where: { campaign: { projectId: locals.activeProjectId }, status: 'bounced' } }),
    db.campaignSend.count({ where: { campaign: { projectId: locals.activeProjectId } } })
  ]);
  const bounce = { bounced, sent, rate: sent ? Math.round((bounced / sent) * 100) : 0 };
  const score = domains.length ? Math.round(domains.reduce((a, d) => a + d.score, 0) / domains.length) : 0;
  return { domains, mailboxes, capacity, bounce, score, project };
};

export const actions: Actions = {
  // Check any domain on demand (useful before mailboxes are connected, e.g. check cryptool.io now).
  check: async ({ request }) => {
    const f = await request.formData();
    const domain = normalizeDomain(String(f.get('domain') ?? ''));
    if (!domain || !domain.includes('.')) return fail(400, { error: 'Enter a domain like cryptool.io' });
    return { ok: 'check', result: await checkDomain(domain) };
  }
};
