import type { LayoutServerLoad } from './$types';
import { db } from '$lib/db';

export const load: LayoutServerLoad = async ({ locals }) => {
  const projects = await db.project.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true, name: true, modeDefault: true }
  });
  const active = locals.activeProjectId
    ? projects.find((p) => p.id === locals.activeProjectId) ?? projects[0] ?? null
    : projects[0] ?? null;
  return { projects, active, user: locals.user ?? null };
};
