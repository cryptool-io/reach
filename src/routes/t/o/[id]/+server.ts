import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { PIXEL_GIF } from '$lib/tracking';

// Open-tracking pixel. /t/o/<messageId>.gif — counts the first open, then always returns the pixel.
export const GET: RequestHandler = async ({ params }) => {
  const id = params.id.replace(/\.gif$/, '');
  try {
    const msg = await db.message.findUnique({ where: { id } });
    if (msg && !msg.openedAt) {
      await db.message.update({ where: { id }, data: { openedAt: new Date() } });
      const meta = JSON.parse(msg.draftMetaJson || '{}') as { versionId?: string; enrollmentId?: string };
      if (meta.versionId) {
        await db.campaignStepVersion.update({ where: { id: meta.versionId }, data: { opened: { increment: 1 } } }).catch(() => {});
      }
      if (meta.enrollmentId) {
        await db.campaignEnrollment
          .update({ where: { id: meta.enrollmentId }, data: { lastEventAt: new Date(), openedAt: new Date() } })
          .catch(() => {});
      }
    }
  } catch {
    /* never block the pixel */
  }
  return new Response(PIXEL_GIF, {
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'no-store, no-cache, must-revalidate, private',
      pragma: 'no-cache'
    }
  });
};
