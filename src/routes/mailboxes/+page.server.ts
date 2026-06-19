import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { saveMailbox, testMailbox, effectiveDailyLimit, remainingToday, projectCapacity, sendFromMailbox, type MailboxCreds } from '$lib/mailboxes';
import { SMTP_PRESETS } from '$lib/channels/email/smtp';
import { encryptJson } from '$lib/crypto';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { mailboxes: [], capacity: null, presets: SMTP_PRESETS, project: null };
  const project = await db.project.findUnique({ where: { id: locals.activeProjectId }, select: { name: true } });
  const rows = await db.mailbox.findMany({ where: { projectId: locals.activeProjectId }, orderBy: { createdAt: 'asc' } });
  const today = new Date().toISOString().slice(0, 10);
  const mailboxes = rows.map((mb) => ({
    id: mb.id, label: mb.label, fromEmail: mb.fromEmail, fromName: mb.fromName, provider: mb.provider,
    dailyLimit: mb.dailyLimit, warmupEnabled: mb.warmupEnabled, status: mb.status, lastError: mb.lastError,
    effLimit: effectiveDailyLimit(mb), remaining: remainingToday(mb),
    sentToday: mb.sentDate === today ? mb.sentToday : 0
  }));
  const capacity = await projectCapacity(locals.activeProjectId);
  return { mailboxes, capacity, presets: SMTP_PRESETS, project };
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === ',') { out.push(cur); cur = ''; }
    else if (c === '"') inQ = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}
const truthy = (s: string) => /^(1|true|yes|y|on)$/i.test(s.trim());

export const actions: Actions = {
  add: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const intOf = (k: string, d: number) => parseInt(String(f.get(k) ?? ''), 10) || d;
    const creds: MailboxCreds = {
      host: String(f.get('host') ?? ''), port: intOf('port', 465), secure: f.get('secure') === 'on',
      user: String(f.get('user') ?? ''), pass: String(f.get('pass') ?? ''),
      fromName: String(f.get('fromName') ?? ''), fromEmail: String(f.get('fromEmail') ?? '').trim(),
      imapHost: String(f.get('imapHost') ?? ''), imapPort: intOf('imapPort', 993)
    };
    if (!creds.fromEmail || !creds.host || !creds.user || !creds.pass)
      return fail(400, { error: 'host, username, password and from-email are required' });
    const mb = await saveMailbox(locals.activeProjectId, {
      label: String(f.get('label') ?? '') || creds.fromEmail, fromName: creds.fromName, creds,
      dailyLimit: intOf('dailyLimit', 40), warmupEnabled: f.get('warmupEnabled') === 'on'
    });
    const t = await testMailbox(mb.id);
    return { ok: 'add', detail: t.ok ? `Connected ${creds.fromEmail}` : `Saved, but test failed: ${t.detail}` };
  },

  // Microsoft 365 via Graph API (app-only). Stores Azure app creds instead of SMTP.
  addGraph: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const creds = {
      type: 'graph' as const,
      tenantId: String(f.get('tenantId') ?? '').trim(),
      clientId: String(f.get('clientId') ?? '').trim(),
      clientSecret: String(f.get('clientSecret') ?? '').trim(),
      fromName: String(f.get('fromName') ?? ''),
      fromEmail: String(f.get('fromEmail') ?? '').trim()
    };
    if (!creds.tenantId || !creds.clientId || !creds.clientSecret || !creds.fromEmail)
      return fail(400, { error: 'Tenant ID, client ID, client secret and from-email are all required.' });
    const warmup = f.get('warmupEnabled') === 'on';
    const mb = await db.mailbox.create({
      data: {
        projectId: locals.activeProjectId,
        provider: 'graph',
        label: String(f.get('label') ?? '') || creds.fromEmail,
        fromName: creds.fromName,
        fromEmail: creds.fromEmail,
        credentialsJson: encryptJson(creds),
        dailyLimit: parseInt(String(f.get('dailyLimit') ?? ''), 10) || 40,
        warmupEnabled: warmup,
        warmupStartedAt: warmup ? new Date() : null
      }
    });
    const t = await testMailbox(mb.id);
    return { ok: 'add', detail: t.ok ? `Connected ${creds.fromEmail} via Microsoft Graph` : `Saved, but test failed: ${t.detail}` };
  },

  // Connect many mailboxes at once from CSV (one per row).
  bulkImport: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const csv = String(f.get('csv') ?? '').trim();
    if (!csv) return fail(400, { error: 'paste a CSV of mailboxes' });
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return fail(400, { error: 'CSV needs a header row + at least one mailbox' });
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const iFromEmail = col('fromemail', 'from_email', 'email');
    const iHost = col('host', 'smtphost', 'smtp_host');
    const iUser = col('user', 'username');
    const iPass = col('pass', 'password');
    if (iFromEmail < 0 || iHost < 0 || iUser < 0 || iPass < 0)
      return fail(400, { error: 'CSV must include columns: fromEmail, host, user, pass' });
    const idx = {
      label: col('label'), fromName: col('fromname', 'from_name'), port: col('port'),
      secure: col('secure', 'ssl'), imapHost: col('imaphost', 'imap_host'), imapPort: col('imapport', 'imap_port'),
      dailyLimit: col('dailylimit', 'daily_limit', 'limit'), warmup: col('warmup', 'warmupenabled')
    };

    let added = 0;
    const errors: string[] = [];
    for (let r = 1; r < lines.length; r++) {
      const c = parseCsvLine(lines[r]);
      const at = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
      const fromEmail = at(iFromEmail);
      if (!fromEmail) continue;
      const host = at(iHost), user = at(iUser), pass = at(iPass);
      if (!host || !user || !pass) { errors.push(`${fromEmail}: missing host/user/pass`); continue; }
      const port = parseInt(at(idx.port), 10) || 465;
      const creds: MailboxCreds = {
        host, port, secure: idx.secure >= 0 ? truthy(at(idx.secure)) : port === 465,
        user, pass, fromName: at(idx.fromName), fromEmail,
        imapHost: at(idx.imapHost), imapPort: parseInt(at(idx.imapPort), 10) || 993
      };
      try {
        await saveMailbox(locals.activeProjectId, {
          label: at(idx.label) || fromEmail, fromName: creds.fromName, creds,
          dailyLimit: parseInt(at(idx.dailyLimit), 10) || 40,
          warmupEnabled: idx.warmup >= 0 ? truthy(at(idx.warmup)) : true
        });
        added++;
      } catch (e) {
        errors.push(`${fromEmail}: ${(e as Error).message}`);
      }
    }
    return { ok: 'bulk', detail: `Added ${added} mailbox(es). Run "Test all" to verify.${errors.length ? ' Issues: ' + errors.slice(0, 5).join('; ') : ''}` };
  },

  testOne: async ({ request }) => {
    const f = await request.formData();
    const t = await testMailbox(String(f.get('id') ?? ''));
    return { ok: t.ok ? 'test-pass' : 'test-fail', detail: t.detail };
  },

  testAll: async ({ locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const mbs = await db.mailbox.findMany({ where: { projectId: locals.activeProjectId } });
    let ok = 0, bad = 0;
    for (const mb of mbs) {
      const t = await testMailbox(mb.id);
      if (t.ok) ok++; else bad++;
    }
    return { ok: 'testall', detail: `${ok} ok, ${bad} failed.` };
  },

  sendTestAll: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const to = String(f.get('to') ?? '').trim();
    if (!to) return fail(400, { error: 'enter a recipient address' });
    const mbs = await db.mailbox.findMany({ where: { projectId: locals.activeProjectId, status: 'active' } });
    if (!mbs.length) return fail(400, { error: 'add at least one mailbox first' });
    const results: { from: string; ok: boolean; detail: string }[] = [];
    for (const mb of mbs) {
      const rr = await sendFromMailbox(mb, { to, subject: 'Reach mailbox test ✅', body: `Test from ${mb.fromEmail} via Reach.` });
      results.push({ from: mb.fromEmail, ok: rr.ok, detail: rr.detail });
    }
    return { ok: 'sendtest', results };
  },

  toggle: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const mb = await db.mailbox.findUnique({ where: { id } });
    if (!mb) return fail(404);
    await db.mailbox.update({ where: { id }, data: { status: mb.status === 'active' ? 'paused' : 'active' } });
    return { ok: 'toggle' };
  },

  remove: async ({ request }) => {
    const f = await request.formData();
    await db.mailbox.delete({ where: { id: String(f.get('id') ?? '') } });
    return { ok: 'remove' };
  }
};
