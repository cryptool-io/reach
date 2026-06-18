import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { markEvent } from '$lib/campaigns/engine';

// Click-tracking redirect. /t/c/<messageId>?u=<url> — counts the first click, then redirects.
export const GET: RequestHandler = async ({ params, url }) => {
  const target = url.searchParams.get('u') ?? '';
  const safe = /^https?:\/\//i.test(target) ? target : '/';

  try {
    const msg = await db.message.findUnique({ where: { id: params.id } });
    if (msg && !msg.clickedAt) {
      await db.message.update({ where: { id: params.id }, data: { clickedAt: new Date() } });
      const meta = JSON.parse(msg.draftMetaJson || '{}') as { versionId?: string; enrollmentId?: string; campaignId?: string };
      if (meta.versionId) {
        await db.campaignStepVersion.update({ where: { id: meta.versionId }, data: { clicked: { increment: 1 } } }).catch(() => {});
      }
      if (meta.enrollmentId) {
        await db.campaignEnrollment
          .update({ where: { id: meta.enrollmentId }, data: { clickedAt: new Date(), openedAt: new Date(), lastEventAt: new Date() } })
          .catch(() => {});
        if (meta.campaignId) {
          const campaign = await db.campaign.findUnique({ where: { id: meta.campaignId } });
          if (campaign?.stopOnClick) await markEvent(meta.enrollmentId, 'paused').catch(() => {});
        }
      }
    }
  } catch {
    /* never block the redirect */
  }
  throw redirect(302, safe);
};
