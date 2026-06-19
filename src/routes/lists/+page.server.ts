import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { lists: [], total: 0 };
  // A "list" = a tag. Count prospects per tag (tags is a comma-separated column).
  const rows = await db.prospect.findMany({ where: { projectId: locals.activeProjectId }, select: { tags: true } });
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const t of (r.tags || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  const lists = Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
  return { lists, total: rows.length };
};
