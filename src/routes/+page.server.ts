import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { projectCapacity } from '$lib/mailboxes';
import { llmStatus } from '$lib/llm';
import { enrollMany } from '$lib/campaigns/engine';

export const load: PageServerLoad = async ({ locals }) => {
  const pid = locals.activeProjectId;
  if (!pid) return { ready: null };

  const [prospects, withEmail, enrolledActive, sent, emailChannel, primaryCampaign, runningCampaigns, capacity] =
    await Promise.all([
      db.prospect.count({ where: { projectId: pid } }),
      db.prospect.count({ where: { projectId: pid, email: { not: '' } } }),
      db.campaignEnrollment.count({ where: { campaign: { projectId: pid }, status: 'active' } }),
      db.campaignSend.count({ where: { campaign: { projectId: pid } } }),
      db.channel.findFirst({ where: { projectId: pid, kind: 'email' } }),
      db.campaign.findFirst({ where: { projectId: pid }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, status: true, _count: { select: { steps: true } } } }),
      db.campaign.count({ where: { projectId: pid, status: 'running' } }),
      projectCapacity(pid)
    ]);

  const ai = llmStatus();
  const checklist = {
    mailboxes: capacity.mailboxes > 0,
    campaign: !!primaryCampaign && primaryCampaign._count.steps > 0,
    enrolled: enrolledActive > 0,
    emailAuto: emailChannel?.mode === 'auto',
    running: runningCampaigns > 0
  };
  const daysToClear = capacity.limit > 0 && enrolledActive > 0 ? Math.ceil(enrolledActive / capacity.limit) : null;

  return {
    ready: { prospects, withEmail, enrolledActive, sent, capacity, checklist, primaryCampaign, daysToClear, ai, userEmail: locals.user?.email ?? '' }
  };
};

export const actions: Actions = {
  // One-click: enroll every prospect that has an email into the primary campaign.
  enrollAll: async ({ locals }) => {
    const pid = locals.activeProjectId;
    if (!pid) return fail(400);
    const camp = await db.campaign.findFirst({ where: { projectId: pid }, orderBy: { createdAt: 'asc' } });
    if (!camp) return fail(400, { error: 'Create a campaign first.' });
    const ids = (await db.prospect.findMany({ where: { projectId: pid, email: { not: '' } }, select: { id: true } })).map((p) => p.id);
    const added = await enrollMany(camp.id, ids);
    return { ok: 'enroll', added };
  },
  // One-click: flip the Email channel to Auto so the scheduler can send.
  setAuto: async ({ locals }) => {
    const pid = locals.activeProjectId;
    if (!pid) return fail(400);
    await db.channel.updateMany({ where: { projectId: pid, kind: 'email' }, data: { mode: 'auto' } });
    return { ok: 'auto' };
  },
  // The deliberate go-live: start the primary campaign (auto-flips email to Auto too).
  start: async ({ locals }) => {
    const pid = locals.activeProjectId;
    if (!pid) return fail(400);
    const camp = await db.campaign.findFirst({ where: { projectId: pid }, orderBy: { createdAt: 'asc' } });
    if (!camp) return fail(400, { error: 'No campaign to start.' });
    await db.channel.updateMany({ where: { projectId: pid, kind: 'email' }, data: { mode: 'auto' } });
    await db.campaign.update({ where: { id: camp.id }, data: { status: 'running' } });
    return { ok: 'started' };
  }
};
