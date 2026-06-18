import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { projectCapacity } from '$lib/mailboxes';

export const load: PageServerLoad = async ({ locals }) => {
  const pid = locals.activeProjectId;
  if (!pid) return { ready: null };

  const [prospects, campaigns, enrolledActive, sent, emailChannel, primaryCampaign, runningCampaigns, capacity] =
    await Promise.all([
      db.prospect.count({ where: { projectId: pid } }),
      db.campaign.count({ where: { projectId: pid } }),
      db.campaignEnrollment.count({ where: { campaign: { projectId: pid }, status: 'active' } }),
      db.campaignSend.count({ where: { campaign: { projectId: pid } } }),
      db.channel.findFirst({ where: { projectId: pid, kind: 'email' } }),
      db.campaign.findFirst({ where: { projectId: pid }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, status: true } }),
      db.campaign.count({ where: { projectId: pid, status: 'running' } }),
      projectCapacity(pid)
    ]);

  const checklist = {
    mailboxes: capacity.mailboxes > 0,
    campaign: campaigns > 0,
    enrolled: enrolledActive > 0,
    emailAuto: emailChannel?.mode === 'auto',
    running: runningCampaigns > 0
  };
  const daysToClear = capacity.limit > 0 && enrolledActive > 0 ? Math.ceil(enrolledActive / capacity.limit) : null;

  return {
    ready: { prospects, campaigns, enrolledActive, sent, capacity, checklist, primaryCampaign, daysToClear }
  };
};
