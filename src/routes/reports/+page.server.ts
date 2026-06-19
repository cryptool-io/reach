import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { campaignStats } from '$lib/campaigns/engine';

const DAY = 86_400_000;
const DAYS = 30;

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { campaigns: [], totals: null, series: [], project: null };
  const pid = locals.activeProjectId;
  const project = await db.project.findUnique({ where: { id: pid }, select: { name: true } });

  const rows = await db.campaign.findMany({ where: { projectId: pid }, orderBy: { createdAt: 'desc' } });
  const campaigns = await Promise.all(rows.map(async (c) => ({ id: c.id, name: c.name, status: c.status, stats: await campaignStats(c.id) })));

  const totals = campaigns.reduce(
    (a, c) => ({
      enrolled: a.enrolled + c.stats.enrolled, sent: a.sent + c.stats.sent, opened: a.opened + c.stats.opened,
      clicked: a.clicked + c.stats.clicked, replied: a.replied + c.stats.replied,
      interested: a.interested + c.stats.interested, maybe: a.maybe + c.stats.maybe, notInterested: a.notInterested + c.stats.notInterested
    }),
    { enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, interested: 0, maybe: 0, notInterested: 0 }
  );
  const openRate = totals.sent ? Math.round((totals.opened / totals.sent) * 100) : 0;
  const replyRate = totals.sent ? Math.round((totals.replied / totals.sent) * 100) : 0;
  const clickRate = totals.sent ? Math.round((totals.clicked / totals.sent) * 100) : 0;

  // 30-day time series
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setTime(since.getTime() - (DAYS - 1) * DAY);
  const [sends, opens, clicks, replies] = await Promise.all([
    db.campaignSend.findMany({ where: { campaign: { projectId: pid }, at: { gte: since } }, select: { at: true } }),
    db.message.findMany({ where: { conversation: { projectId: pid }, openedAt: { gte: since } }, select: { openedAt: true } }),
    db.message.findMany({ where: { conversation: { projectId: pid }, clickedAt: { gte: since } }, select: { clickedAt: true } }),
    db.message.findMany({ where: { conversation: { projectId: pid }, direction: 'in', createdAt: { gte: since } }, select: { createdAt: true } })
  ]);
  const series = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY);
    return { date: d.toISOString().slice(0, 10), sent: 0, opened: 0, clicked: 0, replied: 0 };
  });
  const idx: Record<string, number> = {};
  series.forEach((d, i) => (idx[d.date] = i));
  const bucket = (arr: { [k: string]: Date | null }[], field: string, prop: 'sent' | 'opened' | 'clicked' | 'replied') => {
    for (const r of arr) {
      const t = r[field];
      if (!t) continue;
      const i = idx[new Date(t).toISOString().slice(0, 10)];
      if (i != null) series[i][prop]++;
    }
  };
  bucket(sends as any, 'at', 'sent');
  bucket(opens as any, 'openedAt', 'opened');
  bucket(clicks as any, 'clickedAt', 'clicked');
  bucket(replies as any, 'createdAt', 'replied');

  return { campaigns, totals: { ...totals, openRate, replyRate, clickRate }, series, project };
};
