import { db } from '$lib/db';
import type { Cookies } from '@sveltejs/kit';

const COOKIE = 'reach.activeProject';

export async function resolveActiveProject(cookies: Cookies) {
  const slug = cookies.get(COOKIE);
  if (slug) {
    const p = await db.project.findUnique({ where: { slug } });
    if (p) return p;
  }
  const first = await db.project.findFirst({ orderBy: { createdAt: 'asc' } });
  if (first) {
    cookies.set(COOKIE, first.slug, { path: '/', httpOnly: true, sameSite: 'lax' });
  }
  return first;
}

export function setActiveProject(cookies: Cookies, slug: string) {
  cookies.set(COOKIE, slug, { path: '/', httpOnly: true, sameSite: 'lax' });
}
