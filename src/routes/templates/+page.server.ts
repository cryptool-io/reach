import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { parseFieldSchema } from '$lib/presets';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { templates: [], fieldKeys: [] };
  const [templates, project] = await Promise.all([
    db.template.findMany({ where: { projectId: locals.activeProjectId }, orderBy: { createdAt: 'desc' } }),
    db.project.findUnique({ where: { id: locals.activeProjectId }, select: { fieldSchemaJson: true } })
  ]);
  const fieldKeys = parseFieldSchema(project?.fieldSchemaJson ?? '[]').map((f) => f.key);
  return { templates, fieldKeys };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Name required' });
    await db.template.create({
      data: { projectId: locals.activeProjectId, name, subject: String(f.get('subject') ?? ''), body: String(f.get('body') ?? '') }
    });
    return { ok: 'create' };
  },
  update: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return fail(400);
    await db.template.update({ where: { id }, data: { name: String(f.get('name') ?? ''), subject: String(f.get('subject') ?? ''), body: String(f.get('body') ?? '') } });
    return { ok: 'update' };
  },
  delete: async ({ request }) => {
    const f = await request.formData();
    await db.template.delete({ where: { id: String(f.get('id') ?? '') } });
    return { ok: 'delete' };
  }
};
