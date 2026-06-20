// Inbound sync: poll every sending inbox (mailboxes used for rotation + any legacy email
// Channel), match inbound mail to a prospect, log it to the unified inbox, and drive automation:
//   • bounce / NDR  → mark the failed recipient's enrollments 'bounced' (feeds bounce stats)
//   • auto-reply/OOO → reschedule follow-ups (when the campaign opts in), tag 'out-of-office'
//   • genuine reply  → mark 'replied' so stop-on-reply fires hands-free, count it on the version

import { db } from '$lib/db';
import { decryptJson } from '$lib/crypto';
import { markEvent } from '$lib/campaigns/engine';
import { fetchInboundSince, type InboundEmail } from './imap';
import type { SmtpCreds } from './smtp';

const SEVEN_DAYS = 7 * 86400000;
const POLL_EVERY_MS = 5 * 60 * 1000; // don't reconnect a given inbox more than once per 5 min
const OOO_RESCHEDULE_DAYS = 3;

type ImapCreds = SmtpCreds & { imapHost?: string; imapPort?: number; type?: string };

interface InboxSource {
  label: string;
  projectId: string;
  since: Date;
  creds: ImapCreds;
  touch: (when: Date) => Promise<void>;
}

export async function syncReplies(): Promise<{ scanned: number; matched: number; details: string[] }> {
  const details: string[] = [];
  let matched = 0;
  let scanned = 0;

  const sources = await collectSources();
  for (const src of sources) {
    scanned++;
    const now = new Date();
    let inbound: InboundEmail[] = [];
    try {
      inbound = await fetchInboundSince(src.creds, src.since);
    } catch {
      /* unreachable inbox — skip this round */
    }
    // One email Channel per project anchors inbox logging (conversations need a channelId).
    const emailChannel = await db.channel.findFirst({ where: { projectId: src.projectId, kind: 'email' } });
    for (const msg of inbound) {
      const r = await processInbound(src.projectId, emailChannel?.id ?? null, msg);
      if (r) {
        matched++;
        details.push(r);
      }
    }
    await src.touch(now).catch(() => {});
  }
  return { scanned, matched, details };
}

/** Sending mailboxes with IMAP (skipped if polled in the last 5 min) + legacy connected channels. */
async function collectSources(): Promise<InboxSource[]> {
  const sources: InboxSource[] = [];
  const seen = new Set<string>(); // de-dupe by host+user so a mailbox and channel don't double-poll

  const mailboxes = await db.mailbox.findMany({ where: { status: { not: 'paused' } } });
  for (const mb of mailboxes) {
    if (mb.lastSyncAt && Date.now() - mb.lastSyncAt.getTime() < POLL_EVERY_MS) continue;
    const creds = decryptJson<ImapCreds>(mb.credentialsJson);
    if (!creds?.imapHost || !creds.user || !creds.pass) continue; // Graph / no-IMAP inboxes
    const key = `${creds.imapHost}|${creds.user}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      label: mb.fromEmail,
      projectId: mb.projectId,
      since: mb.lastSyncAt ?? new Date(Date.now() - SEVEN_DAYS),
      creds,
      touch: (when) => db.mailbox.update({ where: { id: mb.id }, data: { lastSyncAt: when } }).then(() => {})
    });
  }

  const channels = await db.channel.findMany({ where: { kind: 'email', status: 'connected' } });
  for (const ch of channels) {
    if (ch.lastSyncAt && Date.now() - ch.lastSyncAt.getTime() < POLL_EVERY_MS) continue;
    const creds = decryptJson<ImapCreds>(ch.credentialsJson);
    if (!creds?.imapHost || !creds.user || !creds.pass) continue;
    const key = `${creds.imapHost}|${creds.user}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      label: ch.connLabel || 'channel',
      projectId: ch.projectId,
      since: ch.lastSyncAt ?? new Date(Date.now() - SEVEN_DAYS),
      creds,
      touch: (when) => db.channel.update({ where: { id: ch.id }, data: { lastSyncAt: when } }).then(() => {})
    });
  }
  return sources;
}

async function processInbound(projectId: string, channelId: string | null, msg: InboundEmail): Promise<string | null> {
  // Resolve which prospect this concerns + the kind of inbound it is.
  let kind: 'bounce' | 'autoreply' | 'reply';
  let prospect;
  if (msg.bounceRecipient) {
    kind = 'bounce';
    prospect = await db.prospect.findFirst({ where: { projectId, email: { equals: msg.bounceRecipient } } });
  } else {
    if (!msg.fromAddress) return null;
    prospect = await db.prospect.findFirst({ where: { projectId, email: { equals: msg.fromAddress } } });
    kind = msg.autoReply ? 'autoreply' : 'reply';
  }
  if (!prospect) return null;

  // Log to the inbox (also our idempotency key — skip if we've already stored this messageId).
  const logged = await logInbound(channelId, projectId, prospect.id, msg, kind);
  if (logged === 'dup') return null;

  if (kind === 'bounce') {
    const enrollments = await db.campaignEnrollment.findMany({
      where: { prospectId: prospect.id, status: { in: ['active', 'paused'] } }
    });
    for (const e of enrollments) await markEvent(e.id, 'bounced');
    return `bounce: ${prospect.email}`;
  }

  if (kind === 'autoreply') {
    const enrollments = await db.campaignEnrollment.findMany({
      where: { prospectId: prospect.id, status: 'active' },
      include: { campaign: true }
    });
    let rescheduled = 0;
    const next = new Date(Date.now() + OOO_RESCHEDULE_DAYS * 86400000);
    for (const e of enrollments) {
      const data: Record<string, unknown> = { interest: 'out-of-office', lastEventAt: new Date() };
      if (e.campaign.autoreplyReschedule && (!e.nextActionAt || e.nextActionAt < next)) {
        data.nextActionAt = next;
        rescheduled++;
      }
      await db.campaignEnrollment.update({ where: { id: e.id }, data });
    }
    return `auto-reply from ${prospect.name}${rescheduled ? ` (rescheduled ${rescheduled})` : ''}`;
  }

  // Genuine reply.
  const enrollments = await db.campaignEnrollment.findMany({ where: { prospectId: prospect.id, status: 'active' } });
  for (const e of enrollments) {
    await markEvent(e.id, 'replied', 'interested');
    const lastSend = await db.campaignSend.findFirst({ where: { enrollmentId: e.id }, orderBy: { at: 'desc' } });
    if (lastSend) {
      await db.campaignStepVersion
        .update({ where: { id: lastSend.versionId }, data: { replied: { increment: 1 } } })
        .catch(() => {});
    }
  }
  if (['contacted', 'new', 'researching'].includes(prospect.stage)) {
    await db.prospect.update({ where: { id: prospect.id }, data: { stage: 'replied' } });
  }
  return `reply from ${prospect.name}`;
}

/** Store an inbound message once. Returns 'dup' when this messageId is already logged, 'skip' when
 *  there's no channel to attach it to (events still fire), else 'ok'. */
async function logInbound(
  channelId: string | null,
  projectId: string,
  prospectId: string,
  msg: InboundEmail,
  kind: string
): Promise<'ok' | 'dup' | 'skip'> {
  if (!channelId) return 'skip';
  const conversation = await db.conversation.upsert({
    where: { prospectId_channelId: { prospectId, channelId } },
    create: { projectId, prospectId, channelId },
    update: { lastAt: msg.date }
  });
  const exists = await db.message.findFirst({
    where: { conversationId: conversation.id, direction: 'in', draftMetaJson: { contains: msg.messageId } }
  });
  if (exists) return 'dup';
  await db.message.create({
    data: {
      conversationId: conversation.id,
      channelId,
      direction: 'in',
      body: msg.subject ? `${msg.subject}\n\n${msg.text}` : msg.text,
      status: 'received',
      sentAt: msg.date,
      draftMetaJson: JSON.stringify({ messageId: msg.messageId, via: 'imap-sync', kind })
    }
  });
  return 'ok';
}
