import { db } from '$lib/db';
import { encryptJson, decryptJson } from '$lib/crypto';
import type { ChannelKind } from '$lib/types';
import { verifySmtp, sendSmtp, type SmtpCreds } from './email/smtp';

export interface ConnInstructions {
  title: string;
  // each field rendered in the credential form
  fields: { key: string; label: string; type?: 'text' | 'password' | 'number' | 'checkbox'; placeholder?: string }[];
  steps: string[];
  note?: string;
}

/** Static setup guidance per channel (non-secret). Email is handled separately via presets. */
export const CHANNEL_SETUP: Record<ChannelKind, ConnInstructions> = {
  email: {
    title: 'Email (SMTP)',
    fields: [
      { key: 'fromName', label: 'From name', placeholder: 'Jane at Acme' },
      { key: 'fromEmail', label: 'From email', placeholder: 'jane@acme.com' },
      { key: 'host', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '465' },
      { key: 'secure', label: 'Use SSL/TLS (port 465)', type: 'checkbox' },
      { key: 'user', label: 'Username', placeholder: 'jane@acme.com' },
      { key: 'pass', label: 'Password / App password', type: 'password' },
      { key: 'imapHost', label: 'IMAP host (for reply sync)', placeholder: 'imap.gmail.com' },
      { key: 'imapPort', label: 'IMAP port', type: 'number', placeholder: '993' }
    ],
    steps: [
      'Pick your provider preset above to auto-fill host/port.',
      'For Gmail/Workspace you must use an App password, not your login password.',
      'Save, then Send a test email to confirm it works.',
      'Add the IMAP host/port (Gmail: imap.gmail.com:993) so Reach can detect replies and auto-stop sequences.'
    ]
  },
  telegram: {
    title: 'Telegram bot',
    fields: [{ key: 'botToken', label: 'Bot token', type: 'password', placeholder: '123456:ABC-DEF...' }],
    steps: [
      'In Telegram, message @BotFather and send /newbot.',
      'Choose a name and a username ending in "bot".',
      'BotFather replies with an HTTP API token — paste it here.',
      'To DM prospects, they must start a chat with your bot first (Telegram bots cannot message strangers).'
    ]
  },
  discord: {
    title: 'Discord bot',
    fields: [{ key: 'botToken', label: 'Bot token', type: 'password', placeholder: 'MTk4N...' }],
    steps: [
      'Go to discord.com/developers/applications → New Application.',
      'Open the Bot tab → Reset Token → copy the token.',
      'Invite the bot to your server via OAuth2 → URL Generator (scope: bot).',
      'Paste the bot token here.'
    ]
  },
  x: {
    title: 'X / Twitter API',
    fields: [
      { key: 'bearer', label: 'Bearer token', type: 'password' },
      { key: 'apiKey', label: 'API key', type: 'password' },
      { key: 'apiSecret', label: 'API secret', type: 'password' }
    ],
    steps: [
      'Apply for a developer account at developer.x.com.',
      'Create a Project + App, then generate keys & a Bearer token.',
      'Paste the Bearer token (DM send requires elevated/paid access).'
    ],
    note: 'X DM automation requires a paid API tier. Test verifies the token can read your account.'
  },
  linkedin: {
    title: 'LinkedIn (manual via Claude-in-Chrome)',
    fields: [{ key: 'profileUrl', label: 'Your LinkedIn profile URL', placeholder: 'https://linkedin.com/in/you' }],
    steps: [
      'LinkedIn has no open send API for outreach — Reach drives it manually through Claude-in-Chrome.',
      'In manual mode, each step opens the prospect profile and copies your drafted message to paste.',
      'Save your profile URL so warm-intro mapping and comment steps know who "you" are.'
    ],
    note: 'No automated sending; status here just marks the channel set up for manual use.'
  }
};

/** Save (encrypt) credentials and a non-secret display label for a channel. */
export async function saveCredentials(channelId: string, kind: ChannelKind, creds: Record<string, unknown>) {
  const label =
    kind === 'email'
      ? String(creds.fromEmail || creds.user || '')
      : kind === 'linkedin'
        ? String(creds.profileUrl || '')
        : `${kind} configured`;
  await db.channel.update({
    where: { id: channelId },
    data: { credentialsJson: encryptJson(creds), connLabel: label }
  });
}

export async function loadCredentials<T = Record<string, unknown>>(channelId: string): Promise<T | null> {
  const ch = await db.channel.findUnique({ where: { id: channelId } });
  if (!ch || !ch.credentialsJson) return null;
  return decryptJson<T>(ch.credentialsJson);
}

/** Load decrypted SMTP creds for a project's email channel (used by the real sender). */
export async function loadProjectSmtp(projectId: string): Promise<SmtpCreds | null> {
  const ch = await db.channel.findFirst({ where: { projectId, kind: 'email' } });
  if (!ch || ch.status !== 'connected' || !ch.credentialsJson) return null;
  return decryptJson<SmtpCreds>(ch.credentialsJson);
}

export interface TestResult {
  ok: boolean;
  detail: string;
}

/** Verify a channel's stored credentials by hitting the provider. */
export async function testConnection(kind: ChannelKind, creds: Record<string, unknown>): Promise<TestResult> {
  try {
    if (kind === 'email') {
      return await verifySmtp(creds as unknown as SmtpCreds);
    }
    if (kind === 'telegram') {
      const r = await fetch(`https://api.telegram.org/bot${creds.botToken}/getMe`);
      const j = await r.json();
      return j.ok
        ? { ok: true, detail: `Bot @${j.result?.username}` }
        : { ok: false, detail: j.description || 'Invalid bot token' };
    }
    if (kind === 'discord') {
      const r = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${creds.botToken}` }
      });
      if (!r.ok) return { ok: false, detail: `Discord API ${r.status}` };
      const j = await r.json();
      return { ok: true, detail: `Bot ${j.username}#${j.discriminator ?? ''}` };
    }
    if (kind === 'x') {
      const r = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${creds.bearer}` }
      });
      if (!r.ok) return { ok: false, detail: `X API ${r.status} — check Bearer token / access tier` };
      const j = await r.json();
      return { ok: true, detail: `@${j.data?.username}` };
    }
    if (kind === 'linkedin') {
      const url = String(creds.profileUrl || '');
      return url.includes('linkedin.com')
        ? { ok: true, detail: 'Profile saved — manual mode ready' }
        : { ok: false, detail: 'Enter a valid linkedin.com profile URL' };
    }
    return { ok: false, detail: 'Unknown channel' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export { sendSmtp };
