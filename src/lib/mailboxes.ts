// Inbox-rotation bulk sender. Many mailboxes per project, each with a daily cap + warm-up ramp.
// Throughput/day ≈ Σ effectiveDailyLimit(mailbox). Send picks the least-loaded mailbox under cap.

import { db } from '$lib/db';
import { encryptJson, decryptJson } from '$lib/crypto';
import { sendSmtp, verifySmtp, type SmtpCreds } from '$lib/channels/email/smtp';
import type { Mailbox } from '@prisma/client';

export interface MailboxCreds extends SmtpCreds {
  imapHost?: string;
  imapPort?: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Warm-up ramp: start gentle, climb to the configured daily limit. */
export function effectiveDailyLimit(mb: Mailbox): number {
  if (!mb.warmupEnabled || !mb.warmupStartedAt) return mb.dailyLimit;
  const days = Math.floor((Date.now() - mb.warmupStartedAt.getTime()) / 86400000);
  const ramped = 15 + days * 5; // day0=15, +5/day
  return Math.max(5, Math.min(mb.dailyLimit, ramped));
}

/** sentToday with daily reset applied (in memory). */
function sentToday(mb: Mailbox): number {
  return mb.sentDate === today() ? mb.sentToday : 0;
}

export function remainingToday(mb: Mailbox): number {
  return Math.max(0, effectiveDailyLimit(mb) - sentToday(mb));
}

/** Total emails this project can still send today across all active mailboxes. */
export async function projectCapacity(projectId: string): Promise<{ remaining: number; mailboxes: number; sentToday: number; limit: number }> {
  const mbs = await db.mailbox.findMany({ where: { projectId, status: 'active' } });
  let remaining = 0, sent = 0, limit = 0;
  for (const mb of mbs) {
    remaining += remainingToday(mb);
    sent += sentToday(mb);
    limit += effectiveDailyLimit(mb);
  }
  return { remaining, mailboxes: mbs.length, sentToday: sent, limit };
}

/** Pick the active mailbox with the most remaining capacity today (spreads load + rotates). */
export async function pickMailbox(projectId: string): Promise<Mailbox | null> {
  const mbs = await db.mailbox.findMany({ where: { projectId, status: 'active' } });
  const eligible = mbs
    .map((mb) => ({ mb, rem: remainingToday(mb) }))
    .filter((x) => x.rem > 0)
    .sort((a, b) => b.rem - a.rem);
  return eligible[0]?.mb ?? null;
}

async function recordSend(mb: Mailbox) {
  const isToday = mb.sentDate === today();
  await db.mailbox.update({
    where: { id: mb.id },
    data: { sentToday: isToday ? { increment: 1 } : 1, sentDate: today(), lastError: '' }
  });
}

export interface ProjectSendResult {
  ok: boolean;
  reason?: 'no-capacity' | 'send-failed';
  mailbox?: string;
  detail?: string;
}

/** Send one email through a rotated mailbox. Returns no-capacity when every mailbox is at its cap. */
export async function sendProjectEmail(
  projectId: string,
  msg: { to: string; subject: string; body: string; html?: string }
): Promise<ProjectSendResult> {
  const mb = await pickMailbox(projectId);
  if (!mb) return { ok: false, reason: 'no-capacity' };
  const creds = decryptJson<MailboxCreds>(mb.credentialsJson);
  if (!creds) return { ok: false, reason: 'send-failed', detail: 'no credentials' };

  const r = await sendSmtp(
    { ...creds, fromName: creds.fromName || mb.fromName, fromEmail: creds.fromEmail || mb.fromEmail },
    msg
  );
  if (r.ok) {
    await recordSend(mb);
    return { ok: true, mailbox: mb.fromEmail };
  }
  await db.mailbox.update({ where: { id: mb.id }, data: { lastError: r.detail } });
  return { ok: false, reason: 'send-failed', detail: r.detail };
}

// ── management helpers (used by the Connections UI) ──────────────────
export async function saveMailbox(
  projectId: string,
  data: { id?: string; label: string; fromName: string; creds: MailboxCreds; dailyLimit: number; warmupEnabled: boolean }
) {
  const base = {
    label: data.label,
    fromName: data.fromName,
    fromEmail: data.creds.fromEmail,
    credentialsJson: encryptJson(data.creds),
    dailyLimit: data.dailyLimit,
    warmupEnabled: data.warmupEnabled
  };
  if (data.id) {
    return db.mailbox.update({ where: { id: data.id }, data: base });
  }
  return db.mailbox.create({
    data: { projectId, ...base, warmupStartedAt: data.warmupEnabled ? new Date() : null }
  });
}

export async function testMailbox(id: string): Promise<{ ok: boolean; detail: string }> {
  const mb = await db.mailbox.findUnique({ where: { id } });
  if (!mb) return { ok: false, detail: 'not found' };
  const creds = decryptJson<MailboxCreds>(mb.credentialsJson);
  if (!creds) return { ok: false, detail: 'no credentials' };
  const r = await verifySmtp(creds);
  await db.mailbox.update({
    where: { id },
    data: { status: r.ok ? 'active' : 'error', lastError: r.ok ? '' : r.detail, lastTestedAt: new Date() }
  });
  return r;
}
