import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { STAGES } from '$lib/types';

const COL_LIMIT = 100; // cap cards per column so large lists stay responsive

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { columns: [] };
  const pid = locals.activeProjectId;
  const columns = await Promise.all(
    STAGES.map(async (stage) => {
      const [items, total] = await Promise.all([
        db.prospect.findMany({
          where: { projectId: pid, stage },
          orderBy: { updatedAt: 'desc' },
          take: COL_LIMIT
        }),
        db.prospect.count({ where: { projectId: pid, stage } })
      ]);
      return { stage, items, total };
    })
  );
  return { columns };
};

export const actions: Actions = {
  moveStage: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const stage = String(f.get('stage') ?? '');
    if (!id || !STAGES.includes(stage as (typeof STAGES)[number])) return fail(400);
    await db.prospect.update({ where: { id }, data: { stage } });
    return { ok: true };
  }
};
