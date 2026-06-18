import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { runJsonAgent } from '$lib/agents';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { project: null, decks: [], plans: [] };
  const [project, decks, plans] = await Promise.all([
    db.project.findUnique({ where: { id: locals.activeProjectId } }),
    db.contentAsset.findMany({ where: { projectId: locals.activeProjectId, kind: 'deck-generated' }, orderBy: { createdAt: 'desc' } }),
    db.contentAsset.findMany({ where: { projectId: locals.activeProjectId, kind: 'dataroom-plan' }, orderBy: { createdAt: 'desc' } })
  ]);
  return {
    project: project ? { name: project.name, narrativeMd: project.narrativeMd, icpMd: project.icpMd } : null,
    decks,
    plans
  };
};

interface Slide { title: string; bullets: string[]; notes: string }
interface DataroomSection { folder: string; documents: { name: string; why: string }[] }

function deckToMarkdown(title: string, slides: Slide[]): string {
  let md = `# ${title}\n\n`;
  slides.forEach((s, i) => {
    md += `## ${i + 1}. ${s.title}\n\n`;
    for (const b of s.bullets ?? []) md += `- ${b}\n`;
    if (s.notes) md += `\n> Speaker note: ${s.notes}\n`;
    md += `\n`;
  });
  return md;
}

function dataroomToMarkdown(sections: DataroomSection[], tips: string[]): string {
  let md = `# Data room structure\n\n`;
  for (const s of sections ?? []) {
    md += `## ${s.folder}\n\n`;
    for (const d of s.documents ?? []) md += `- [ ] **${d.name}** — ${d.why}\n`;
    md += `\n`;
  }
  if (tips?.length) {
    md += `## Tips\n\n`;
    for (const t of tips) md += `- ${t}\n`;
  }
  return md;
}

export const actions: Actions = {
  buildDeck: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const input = String(f.get('input') ?? '').trim();
    const project = await db.project.findUniqueOrThrow({ where: { id: locals.activeProjectId } });

    let res;
    try {
      res = await runJsonAgent<{ title: string; slides: Slide[] }>(
        project.id,
        'deck.outline',
        { narrative: project.narrativeMd || '(none)', icp: project.icpMd || '(none)', input: input || '(none)' },
        { maxTokens: 2500 }
      );
    } catch (e) {
      return fail(500, { error: (e as Error).message });
    }
    if (!res.data?.slides) return fail(502, { error: 'Could not parse the deck. Try again.' });

    const title = res.data.title || `${project.name} — deck`;
    const md = deckToMarkdown(title, res.data.slides);
    await db.contentAsset.create({
      data: { projectId: project.id, kind: 'deck-generated', title, url: '', body: md, notes: input }
    });
    return { ok: 'deck' };
  },

  buildDataroom: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const input = String(f.get('input') ?? '').trim();
    const project = await db.project.findUniqueOrThrow({ where: { id: locals.activeProjectId } });

    let res;
    try {
      res = await runJsonAgent<{ sections: DataroomSection[]; tips: string[] }>(
        project.id,
        'dataroom.structure',
        { narrative: project.narrativeMd || '(none)', input: input || '(none)' },
        { maxTokens: 2000 }
      );
    } catch (e) {
      return fail(500, { error: (e as Error).message });
    }
    if (!res.data?.sections) return fail(502, { error: 'Could not parse the plan. Try again.' });

    const md = dataroomToMarkdown(res.data.sections, res.data.tips ?? []);
    await db.contentAsset.create({
      data: { projectId: project.id, kind: 'dataroom-plan', title: `Data room plan — ${project.name}`, url: '', body: md, notes: input }
    });
    return { ok: 'dataroom' };
  },

  deleteAsset: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return fail(400);
    await db.contentAsset.delete({ where: { id } });
    return { ok: 'deleted' };
  }
};
