import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/db';

const COOKIE = 'reach.session';
const MAX_AGE_DAYS = 30;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(cookies: Cookies, userId: string) {
  const expiresAt = new Date(Date.now() + MAX_AGE_DAYS * 86400000);
  const session = await db.session.create({ data: { userId, expiresAt } });
  cookies.set(COOKIE, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_DAYS * 86400
  });
}

export async function destroySession(cookies: Cookies) {
  const id = cookies.get(COOKIE);
  if (id) await db.session.deleteMany({ where: { id } });
  cookies.delete(COOKIE, { path: '/' });
}

export async function getUser(cookies: Cookies): Promise<{ id: string; email: string } | null> {
  const id = cookies.get(COOKIE);
  if (!id) return null;
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  return { id: session.user.id, email: session.user.email };
}

export async function userCount(): Promise<number> {
  return db.user.count();
}
