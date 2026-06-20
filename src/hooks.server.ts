import { redirect, type Handle } from '@sveltejs/kit';
import { resolveActiveProject } from '$lib/active-project';
import { startScheduler } from '$lib/scheduler';
import { getUser } from '$lib/auth';

// Start the in-process auto-fire scheduler once, on server boot.
startScheduler();

function isPublic(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/favicon.svg' ||
    pathname.startsWith('/t/') || // open/click tracking — hit by recipients, no session
    pathname.startsWith('/u/') || // one-click unsubscribe — hit by recipients, no session
    pathname.startsWith('/api/v1/') || // public REST API — authed by bearer token, not session
    pathname.startsWith('/_app') ||
    pathname.startsWith('/@') // vite dev internals
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  const user = await getUser(event.cookies);
  event.locals.user = user ?? undefined;

  // Gate everything behind login (except the login page + assets).
  if (!user && !isPublic(event.url.pathname)) {
    throw redirect(303, '/login');
  }

  if (user) {
    const p = await resolveActiveProject(event.cookies);
    if (p) event.locals.activeProjectId = p.id;
  }
  return resolve(event);
};
