// Basic email verification / list hygiene — syntax + domain MX (or A) lookup. No external service:
// catches malformed addresses and dead domains (the bulk of bounce risk) and flags role inboxes.
// Domains are MX-cached so verifying a big list does only a handful of DNS lookups per domain.

import { promises as dns } from 'node:dns';

export type EmailStatus = 'valid' | 'invalid' | 'risky' | 'unknown';

const SYNTAX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LOCALPARTS = new Set([
  'info', 'admin', 'support', 'sales', 'contact', 'hello', 'team', 'office', 'help', 'billing',
  'careers', 'jobs', 'marketing', 'press', 'webmaster', 'postmaster', 'abuse', 'no-reply', 'noreply'
]);

const mxCache = new Map<string, boolean>();

function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}

async function domainAcceptsMail(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  const mx = await withTimeout(dns.resolveMx(domain).catch(() => [] as { exchange: string }[]), 4000, []);
  let ok = mx.length > 0;
  if (!ok) ok = await withTimeout(dns.resolve(domain).then(() => true).catch(() => false), 3000, false);
  mxCache.set(domain, ok);
  return ok;
}

export async function verifyEmail(email: string): Promise<EmailStatus> {
  const e = (email || '').trim().toLowerCase();
  if (!e || !SYNTAX.test(e)) return 'invalid';
  const at = e.lastIndexOf('@');
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain.includes('.')) return 'invalid';
  if (!(await domainAcceptsMail(domain))) return 'invalid';
  if (ROLE_LOCALPARTS.has(local)) return 'risky'; // deliverable but low-quality (shared inbox)
  return 'valid';
}

/** Verify a batch with bounded concurrency. Returns id → status. */
export async function verifyBatch(rows: { id: string; email: string }[]): Promise<Map<string, EmailStatus>> {
  const out = new Map<string, EmailStatus>();
  const CONCURRENCY = 20;
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const r = rows[i++];
      out.set(r.id, await verifyEmail(r.email));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length || 1) }, worker));
  return out;
}
