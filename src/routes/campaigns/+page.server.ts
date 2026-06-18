import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail, redirect } from '@sveltejs/kit';
import { campaignStats } from '$lib/campaigns/engine';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { campaigns: [] };
  const rows = await db.campaign.findMany({
    where: { projectId: locals.activeProjectId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { steps: true, enrollments: true } },
      steps: { select: { channel: true }, orderBy: { order: 'asc' } }
    }
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

  setStatus: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const status = String(f.get('status') ?? '');
    if (!id || !['draft', 'running', 'paused', 'completed'].includes(status)) return fail(400);
    const campaign = await db.campaign.update({ where: { id }, data: { status } });
    if (status === 'running') {
      await db.channel.updateMany({ where: { projectId: campaign.projectId, kind: 'email' }, data: { mode: 'auto' } });
    }
    return { ok: 'status' };
  },

  duplicate: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const src = await db.campaign.findUnique({
      where: { id },
      include: { steps: { include: { versions: true }, orderBy: { order: 'asc' } } }
    });
    if (!src) return fail(404);
    const { id: _i, createdAt: _c, name, status: _s, projectId: _p, ...settings } = src as Record<string, unknown> & { steps: unknown };
    delete (settings as Record<string, unknown>).steps;
    const copy = await db.campaign.create({
      data: { ...(settings as object), projectId: locals.activeProjectId, name: `${name} (copy)`, status: 'draft' }
    });
    for (const step of src.steps) {
      const ns = await db.campaignStep.create({
        data: { campaignId: copy.id, order: step.order, channel: step.channel, delayDays: step.delayDays, condition: step.condition, waitForCondition: step.waitForCondition, waitTimeoutHours: step.waitTimeoutHours, onTimeout: step.onTimeout }
      });
      for (const v of step.versions) {
        await db.campaignStepVersion.create({ data: { stepId: ns.id, label: v.label, subject: v.subject, body: v.body } });
      }
    }
    throw redirect(303, `/campaigns/${copy.id}`);
  },

  delete: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return fail(400);
    await db.campaign.delete({ where: { id } });
    return { ok: true };
  }
};
