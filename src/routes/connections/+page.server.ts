import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { CHANNEL_KINDS, type ChannelKind } from '$lib/types';
import { CHANNEL_SETUP, saveCredentials, loadCredentials, testConnection, sendSmtp } from '$lib/channels/connections';
import { SMTP_PRESETS, type SmtpCreds } from '$lib/channels/email/smtp';
import { maskSecret } from '$lib/crypto';
import { projectCapacity } from '$lib/mailboxes';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId)
    return { channels: [], setup: CHANNEL_SETUP, presets: SMTP_PRESETS, capacity: null };
  const channels = await db.channel.findMany({
    where: { projectId: locals.activeProjectId },
    orderBy: { kind: 'asc' }
  });

  // Surface non-secret saved values so the form can pre-fill; secrets are masked.
  const enriched = await Promise.all(
    channels.map(async (ch) => {
      const creds = (await loadCredentials(ch.id)) ?? {};
      const setup = CHANNEL_SETUP[ch.kind as ChannelKind];
      const values: Record<string, string> = {};
      for (const f of setup?.fields ?? []) {
        const raw = creds[f.key];
        if (f.type === 'password') values[f.key] = raw ? maskSecret(String(raw)) : '';
        else if (f.type === 'checkbox') values[f.key] = raw ? 'on' : '';
        else values[f.key] = raw == null ? '' : String(raw);
      }
      return { ...ch, hasCreds: Object.keys(creds).length > 0, values };
    })
  );

  const capacity = await projectCapacity(locals.activeProjectId);
  return { channels: enriched, setup: CHANNEL_SETUP, presets: SMTP_PRESETS, capacity };
};

function collectCreds(kind: ChannelKind, f: FormData): Record<string, unknown> {
  const setup = CHANNEL_SETUP[kind];
  const out: Record<string, unknown> = {};
  for (const field of setup.fields) {
    const v = f.get(field.key);
    if (field.type === 'checkbox') out[field.key] = v === 'on' || v === 'true';
    else if (field.type === 'number') out[field.key] = parseInt(String(v ?? ''), 10) || 0;
    else out[field.key] = String(v ?? '');
  }
  return out;
}

/** Merge in unchanged (masked) password fields so saving without re-typing keeps the secret. */
async function mergeSecrets(channelId: string, kind: ChannelKind, incoming: Record<string, unknown>) {
  const existing = (await loadCredentials(channelId)) ?? {};
  const setup = CHANNEL_SETUP[kind];
  for (const field of setup.fields) {
    if (field.type === 'password') {
      const val = String(incoming[field.key] ?? '');
      if (!val || val.startsWith('••••')) incoming[field.key] = existing[field.key] ?? '';
    }
  }
  return incoming;
}

export const actions: Actions = {
  save: async ({ request }) => {
    const f = await request.formData();
    const channelId = String(f.get('channelId') ?? '');
    const kind = String(f.get('kind') ?? '') as ChannelKind;
    if (!channelId || !CHANNEL_KINDS.includes(kind)) return fail(400, { error: 'bad channel' });
    const creds = await mergeSecrets(channelId, kind, collectCreds(kind, f));
    await saveCredentials(channelId, kind, creds);
    return { ok: 'saved', kind };
  },

  test: async ({ request }) => {
    const f = await request.formData();
    const channelId = String(f.get('channelId') ?? '');
    const kind = String(f.get('kind') ?? '') as ChannelKind;
    if (!channelId || !CHANNEL_KINDS.includes(kind)) return fail(400, { error: 'bad channel' });

    // Save first (so the test uses what's on screen), then verify.
    const creds = await mergeSecrets(channelId, kind, collectCreds(kind, f));
    await saveCredentials(channelId, kind, creds);

    const result = await testConnection(kind, creds);
    await db.channel.update({
      where: { id: channelId },
      data: {
        status: result.ok ? 'connected' : 'error',
        lastTestError: result.ok ? '' : result.detail,
        lastTestedAt: new Date()
      }
    });
    return { ok: result.ok ? 'test-pass' : 'test-fail', kind, detail: result.detail };
  },

  sendTest: async ({ request }) => {
    const f = await request.formData();
    const channelId = String(f.get('channelId') ?? '');
    const to = String(f.get('to') ?? '').trim();
    if (!channelId || !to) return fail(400, { error: 'recipient required' });
    const creds = (await loadCredentials<SmtpCreds>(channelId)) ?? null;
    if (!creds) return fail(400, { error: 'Save SMTP credentials first.' });
    const result = await sendSmtp(creds, {
      to,
      subject: 'Reach — test email ✅',
      body: 'This is a test from Reach. If you can read this, your SMTP connection works.'
    });
    await db.channel.update({
      where: { id: channelId },
      data: {
        status: result.ok ? 'connected' : 'error',
        lastTestError: result.ok ? '' : result.detail,
        lastTestedAt: new Date()
      }
    });
    return { ok: result.ok ? 'send-pass' : 'send-fail', detail: result.detail };
  },

  disconnect: async ({ request }) => {
    const f = await request.formData();
    const channelId = String(f.get('channelId') ?? '');
    if (!channelId) return fail(400);
    await db.channel.update({
      where: { id: channelId },
      data: { credentialsJson: '', connLabel: '', status: 'disconnected', lastTestError: '' }
    });
    return { ok: 'disconnected' };
  }
};
