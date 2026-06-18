import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/db';
import { hashPassword, verifyPassword, createSession, userCount } from '$lib/auth';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(303, '/');
  return { firstRun: (await userCount()) === 0 };
};

export const actions: Actions = {
  // First-run: create the initial admin account.
  register: async ({ request, cookies }) => {
    if ((await userCount()) > 0) return fail(400, { error: 'An account already exists. Please sign in.' });
    const f = await request.formData();
    const email = String(f.get('email') ?? '').trim().toLowerCase();
    const password = String(f.get('password') ?? '');
    if (!email || !email.includes('@')) return fail(400, { error: 'Enter a valid email.' });
    if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters.' });

    const user = await db.user.create({ data: { email, passwordHash: hashPassword(password) } });
    await createSession(cookies, user.id);
    throw redirect(303, '/');
  },

  login: async ({ request, cookies }) => {
    const f = await request.formData();
    const email = String(f.get('email') ?? '').trim().toLowerCase();
    const password = String(f.get('password') ?? '');
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail(400, { error: 'Invalid email or password.', email });
    }
    await createSession(cookies, user.id);
    throw redirect(303, '/');
  }
};
