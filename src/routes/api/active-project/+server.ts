import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { setActiveProject } from '$lib/active-project';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { slug } = await request.json();
  if (typeof slug !== 'string') throw error(400, 'slug required');
  const p = await db.project.findUnique({ where: { slug } });
  if (!p) throw error(404, 'project not found');
  setActiveProject(cookies, slug);
  return json({ ok: true, id: p.id });
};
