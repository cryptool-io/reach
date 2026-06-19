import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { sendProjectEmail } from '$lib/mailboxes';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.activeProjectId) return { conversations: [], filter: null, selected: null, mailboxCount: 0 };
  const pid = locals.activeProjectId;
  const filter = url.searchParams.get('channel');
  const selId = url.searchParams.get('c');

  const convs = await db.conversation.findMany({
    where: { projectId: pid, ...(filter ? { channel: { kind: filter } } : {}) },
    include: { prospect: true, channel: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { lastAt: 'desc' },
    take: 200
  });

  // interest per prospect (most recent enrollment) for the list + selected header
  const prospectIds = [...new Set(convs.map((c) => c.prospectId))];
  const enrs = prospectIds.length
    ? await db.campaignEnrollment.findMany({
        where: { prospectId: { in: prospectIds }, campaign: { projectId: pid } },
        select: { prospectId: true, interest: true },
        orderBy: { createdAt: 'desc' }
      })
    : [];
  const interestBy: Record<string, string> = {};
  for (const e of enrs) if (!interestBy[e.prospectId]) interestBy[e.prospectId] = e.interest;
  const conversations = convs.map((c) => ({ ...c, interest: interestBy[c.prospectId] ?? 'none' }));

  let selected = null;
  if (selId) {
    const conv = await db.conversation.findFirst({
      where: { id: selId, projectId: pid },
      include: { prospect: true, channel: true, messages: { orderBy: { createdAt: 'asc' } } }
    });
    if (conv) selected = { ...conv, interest: interestBy[conv.prospectId] ?? 'none' };
  }
  const mailboxCount = await db.mailbox.count({ where: { projectId: pid, status: 'active' } });
  return { conversations, filter, selected, mailboxCount };
};

export const actions: Actions = {
  setInterest: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const prospectId = String(f.get('prospectId') ?? '');
    const interest = String(f.get('interest') ?? '');
    if (!prospectId || !['interested', 'maybe', 'not-interested', 'none'].includes(interest)) return fail(400);
    await db.campaignEnrollment.updateMany({
      where: { prospectId, campaign: { projectId: locals.activeProjectId } },
      data: { interest, lastEventAt: new Date() }
    });
    const stage = interest === 'not-interested' ? 'passed' : interest === 'none' ? undefined : 'replied';
    if (stage) await db.prospect.update({ where: { id: prospectId }, data: { stage } }).catch(() => {});
    return { ok: 'interest' };
  },

  reply: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const conversationId = String(f.get('conversationId') ?? '');
    const body = String(f.get('body') ?? '').trim();
    if (!conversationId || !body) return fail(400, { error: 'Write a reply first.' });
    const conv = await db.conversation.findFirst({
      where: { id: conversationId, projectId: locals.activeProjectId },
      include: { prospect: true, channel: true }
    });
    if (!conv) return fail(404);

    if (conv.channel.kind === 'email') {
      const to = conv.prospect.email;
      if (!to) return fail(400, { error: 'This prospect has no email address.' });
      const r = await sendProjectEmail(conv.projectId, { to, subject: `Re: ${conv.prospect.company || 'your message'}`, body });
      await db.message.create({
        data: { conversationId, channelId: conv.channelId, direction: 'out', body, status: r.ok ? 'sent' : 'failed', sentAt: r.ok ? new Date() : null }
      });
      await db.conversation.update({ where: { id: conversationId }, data: { lastAt: new Date() } });
      if (!r.ok) return fail(400, { error: r.reason === 'no-capacity' ? 'No active mailbox — connect one under Mailboxes to send replies.' : `Send failed: ${r.detail ?? ''}` });
      return { ok: 'reply' };
    }
    // non-email channels: store as a draft to send manually
    await db.message.create({ data: { conversationId, channelId: conv.channelId, direction: 'out', body, status: 'draft' } });
    await db.conversation.update({ where: { id: conversationId }, data: { lastAt: new Date() } });
    return { ok: 'reply-draft' };
  }
};
