import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { runJsonAgent } from '$lib/agents';
import { apolloConfigured, searchApolloPeople, type ApolloPerson } from '$lib/apollo';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { project: null, apollo: apolloConfigured() };
  const project = await db.project.findUnique({ where: { id: locals.activeProjectId } });
  return {
    project: project ? { name: project.name, icpMd: project.icpMd, narrativeMd: project.narrativeMd } : null,
    apollo: apolloConfigured()
  };
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
  },

  // Apollo.io — licensed verified contacts.
  apolloSearch: async ({ request }) => {
    const f = await request.formData();
    const titles = String(f.get('titles') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const keywords = String(f.get('keywords') ?? '').trim();
    const locations = String(f.get('locations') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const page = parseInt(String(f.get('page') ?? '1'), 10) || 1;
    if (!titles.length && !keywords && !locations.length) return fail(400, { error: 'Add at least a title, keyword, or location to search.' });
    try {
      const res = await searchApolloPeople({ titles, keywords, locations, page, perPage: 25 });
      return { apolloResult: { ...res, query: { titles: titles.join(', '), keywords, locations: locations.join(', ') } } };
    } catch (e) {
      return fail(502, { error: (e as Error).message });
    }
  },

  apolloImport: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const rows = f
      .getAll('row')
      .map((r) => { try { return JSON.parse(String(r)) as ApolloPerson; } catch { return null; } })
      .filter((r): r is ApolloPerson => !!r && !!r.name);
    if (!rows.length) return fail(400, { error: 'Select at least one contact to import.' });
    const emails = rows.map((r) => r.email).filter(Boolean);
    const existing = new Set<string>(
      emails.length
        ? (await db.prospect.findMany({ where: { projectId: locals.activeProjectId, email: { in: emails } }, select: { email: true } })).map((p) => p.email)
        : []
    );
    const fresh = rows.filter((r) => !r.email || !existing.has(r.email));
    await db.prospect.createMany({
      data: fresh.map((r) => ({
        projectId: locals.activeProjectId!,
        name: r.name,
        company: r.company ?? '',
        role: r.title ?? '',
        email: r.email ?? '',
        linkedinUrl: r.linkedinUrl ?? '',
        stage: 'new',
        tags: 'apollo',
        customJson: JSON.stringify({ source: 'apollo', location: r.location ?? '', domain: r.domain ?? '', email_status: r.emailStatus ?? '' })
      }))
    });
    return { added: fresh.length, skipped: rows.length - fresh.length };
  }
};
