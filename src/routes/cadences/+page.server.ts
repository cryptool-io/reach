import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { cadences: [], prospects: [] };
  const [cadences, prospects] = await Promise.all([
    db.cadence.findMany({
      where: { projectId: locals.activeProjectId },
      include: { _count: { select: { runs: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    db.prospect.findMany({
      where: { projectId: locals.activeProjectId },
      select: { id: true, name: true, company: true, stage: true },
      orderBy: { updatedAt: 'desc' },
      take: 200
    })
  ]);
  return { cadences, prospects };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim();
    const stepsRaw = String(f.get('steps') ?? '').trim();
    if (!name || !stepsRaw) return fail(400, { error: 'name + steps required' });
    let steps: unknown;
    try {
      steps = JSON.parse(stepsRaw);
    } catch {
      return fail(400, { error: 'steps is not valid JSON' });
    }
    await db.cadence.create({
      data: { projectId: locals.activeProjectId, name, stepsJson: JSON.stringify(steps) }
    });
    return { ok: true };
  },

  assign: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const cadenceId = String(f.get('cadenceId') ?? '');
    const prospectId = String(f.get('prospectId') ?? '');
    if (!cadenceId || !prospectId) return fail(400);
    const cadence = await db.cadence.findUniqueOrThrow({ where: { id: cadenceId } });
    const steps = JSON.parse(cadence.stepsJson) as Array<{ day: number; channel: string; intent: string }>;
    const first = steps[0];
    const fireAt = first ? new Date(Date.now() + first.day * 24 * 60 * 60 * 1000) : null;

    const run = await db.cadenceRun.create({
      data: { cadenceId, prospectId, nextFireAt: fireAt, currentStep: 0 }
    });
    if (first) {
      await db.task.create({
        data: {
          projectId: locals.activeProjectId,
          prospectId,
          kind: 'cadence-step',
          title: `${cadence.name} · step 1 (${first.channel} · ${first.intent})`,
          dueAt: fireAt!,
          metaJson: JSON.stringify({ runId: run.id, step: 0 })
        }
      });
    }
    return { ok: true };
  }
};
