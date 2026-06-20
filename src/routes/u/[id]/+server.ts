import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { markEvent } from '$lib/campaigns/engine';
import { addSuppression } from '$lib/suppression';

// `id` is a campaign enrollment id (seeded into the per-send unsubscribe link). Opting out adds the
// prospect's address to the project-wide suppression list and stops every active sequence for them.
async function optOut(id: string): Promise<boolean> {
  const enr = await db.campaignEnrollment.findUnique({
    where: { id },
    include: { prospect: true, campaign: true }
  });
  if (!enr) return false;
  await addSuppression(enr.campaign.projectId, enr.prospect.email, 'unsubscribe');
  const active = await db.campaignEnrollment.findMany({
    where: { prospectId: enr.prospectId, status: 'active' },
    select: { id: true }
  });
  for (const e of active) await markEvent(e.id, 'opted-out');
  if (!active.some((e) => e.id === enr.id)) await markEvent(enr.id, 'opted-out');
  return true;
}

// RFC 8058 one-click unsubscribe — the List-Unsubscribe-Post target. No confirmation page.
export const POST: RequestHandler = async ({ params }) => {
  await optOut(params.id);
  return new Response(null, { status: 200 });
};

// Browser click on the visible in-body unsubscribe link.
export const GET: RequestHandler = async ({ params }) => {
  const ok = await optOut(params.id);
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>` +
    `<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;text-align:center;color:#111">` +
    `<h1 style="font-size:20px;margin:0 0 12px">${ok ? "You've been unsubscribed" : 'Already unsubscribed'}</h1>` +
    `<p style="color:#555;line-height:1.5">You won't receive any more emails from this sender. You can close this tab.</p>` +
    `</body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
};
