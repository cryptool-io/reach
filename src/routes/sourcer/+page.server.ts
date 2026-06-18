import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { runJsonAgent } from '$lib/agents';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { project: null };
  const project = await db.project.findUnique({ where: { id: locals.activeProjectId } });
  return { project: project ? { name: project.name, icpMd: project.icpMd, narrativeMd: project.narrativeMd } : null };
};

interface Suggestion {
  name: string;
  company: string;
  role: string;
  reason: string;
  search_query: string;
}

export const actions: Actions = {
  suggest: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const criteria = String(f.get('criteria') ?? '').trim();
    const project = await db.project.findUniqueOrThrow({ where: { id: locals.activeProjectId } });

    let res;
    try {
      res = await runJsonAgent<{ prospects: Suggestion[]; note: string }>(
        project.id,
        'sourcer.suggest',
        {
          narrative: project.narrativeMd || '(none)',
          icp: project.icpMd || '(none)',
          criteria: criteria || '(none beyond the ICP)'
        },
        { maxTokens: 2000 }
      );
    } catch (e) {
      return fail(500, { error: (e as Error).message });
    }
    if (!res.data?.prospects) return fail(502, { error: 'Could not parse suggestions. Try again.' });
    return { suggestions: res.data.prospects.slice(0, 25), note: res.data.note ?? '' };
  },

  add: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const rows = f.getAll('row').map((r) => {
      try {
        return JSON.parse(String(r)) as Suggestion;
      } catch {
        return null;
      }
    }).filter((r): r is Suggestion => !!r && !!r.name);
    if (rows.length === 0) return fail(400, { error: 'select at least one suggestion' });

    await db.prospect.createMany({
      data: rows.map((r) => ({
        projectId: locals.activeProjectId!,
        name: r.name,
        company: r.company ?? '',
        role: r.role ?? '',
        stage: 'new',
        customJson: JSON.stringify({ source: 'sourcer', sourcer_reason: r.reason ?? '', search_query: r.search_query ?? '' })
      }))
    });
    return { added: rows.length };
  }
};
