import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail, redirect } from '@sveltejs/kit';
import { campaignStats } from '$lib/campaigns/engine';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { campaigns: [] };
  const rows = await db.campaign.findMany({
    where: { projectId: locals.activeProjectId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { steps: true, enrollments: true } } }
  });
  const campaigns = await Promise.all(
    rows.map(async (c) => ({ ...c, stats: await campaignStats(c.id) }))
  );
  return { campaigns };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'name required' });

    const campaign = await db.campaign.create({
      data: { projectId: locals.activeProjectId, name }
    });
    // seed an opening email step with an A version so the builder isn't empty
    const step = await db.campaignStep.create({
      data: { campaignId: campaign.id, order: 1, channel: 'email', delayDays: 0, condition: 'always' }
    });
    await db.campaignStepVersion.create({
      data: { stepId: step.id, label: 'A', subject: 'Quick intro — {{company}}', body: 'Hi {{first_name}},\n\n' }
    });
    throw redirect(303, `/campaigns/${campaign.id}`);
  },

  delete: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return fail(400);
    await db.campaign.delete({ where: { id } });
    return { ok: true };
  }
};
