// Reply sync: poll connected mailboxes, match inbound mail to a prospect, log it,
// and mark any active campaign enrollment as replied (so stop-on-reply fires hands-free).

import { db } from '$lib/db';
import { decryptJson } from '$lib/crypto';
import { markEvent } from '$lib/campaigns/engine';
import { fetchInboundSince } from './imap';
import type { SmtpCreds } from './smtp';

export async function syncReplies(): Promise<{ scanned: number; matched: number; details: string[] }> {
  const details: string[] = [];
  let matched = 0;
  let scanned = 0;

  const channels = await db.channel.findMany({ where: { kind: 'email', status: 'connected' } });
  for (const ch of channels) {
    const creds = decryptJson<SmtpCreds & { imapHost?: string; imapPort?: number }>(ch.credentialsJson);
    if (!creds?.imapHost) continue;
    scanned++;

    const since = ch.lastSyncAt ?? new Date(Date.now() - 7 * 86400000); // first run: last 7 days
    const inbound = await fetchInboundSince(creds, since);

    for (const msg of inbound) {
      if (!msg.fromAddress) continue;
      const prospect = await db.prospect.findFirst({
        where: { projectId: ch.projectId, email: { equals: msg.fromAddress } }
      });
      if (!prospect) continue;

      const conversation = await db.conversation.upsert({
        where: { prospectId_channelId: { prospectId: prospect.id, channelId: ch.id } },
        create: { projectId: ch.projectId, prospectId: prospect.id, channelId: ch.id },
        update: { lastAt: msg.date }
      });

      // de-dupe by messageId stored in draftMeta
      const exists = await db.message.findFirst({
        where: { conversationId: conversation.id, direction: 'in', draftMetaJson: { contains: msg.messageId } }
      });
      if (exists) continue;

      await db.message.create({
        data: {
          conversationId: conversation.id,
          channelId: ch.id,
          direction: 'in',
          body: msg.subject ? `${msg.subject}\n\n${msg.text}` : msg.text,
          status: 'received',
          sentAt: msg.date,
          draftMetaJson: JSON.stringify({ messageId: msg.messageId, via: 'imap-sync' })
        }
      });

      // mark active enrollments replied (honors stop-on-reply inside markEvent) + count the reply on its version
      const enrollments = await db.campaignEnrollment.findMany({
        where: { prospectId: prospect.id, status: 'active' }
      });
      for (const e of enrollments) {
        await markEvent(e.id, 'replied', 'interested');
        const lastSend = await db.campaignSend.findFirst({ where: { enrollmentId: e.id }, orderBy: { at: 'desc' } });
        if (lastSend) {
          await db.campaignStepVersion.update({ where: { id: lastSend.versionId }, data: { replied: { increment: 1 } } }).catch(() => {});
        }
      }
      if (['contacted', 'new', 'researching'].includes(prospect.stage)) {
        await db.prospect.update({ where: { id: prospect.id }, data: { stage: 'replied' } });
      }
      matched++;
      details.push(`reply from ${prospect.name}`);
    }

    await db.channel.update({ where: { id: ch.id }, data: { lastSyncAt: new Date() } });
  }
  return { scanned, matched, details };
}
