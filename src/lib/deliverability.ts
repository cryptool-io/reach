// Live deliverability checks for a sending domain: SPF, DKIM, DMARC, MX via DNS.
// Pure Node DNS — no external service. Each lookup is time-bounded so a slow/missing record
// can't hang the page.

import { promises as dns } from 'node:dns';

function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), ms))]);
}
async function txt(host: string): Promise<string[]> {
  return withTimeout(
    dns.resolveTxt(host).then((rs) => rs.map((r) => r.join(''))).catch(() => [] as string[]),
    4000,
    []
  );
}
async function mxOf(domain: string) {
  return withTimeout(
    dns.resolveMx(domain).catch(() => [] as { exchange: string; priority: number }[]),
    4000,
    [] as { exchange: string; priority: number }[]
  );
}

// Most common DKIM selectors across providers (Google, M365, Mailgun, SendGrid, generic).
const DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'k1', 'dkim', 'mail', 's1'];

export interface Check {
  ok: boolean;
  detail: string;
}
export interface DomainCheck {
  domain: string;
  spf: Check;
  dkim: Check;
  dmarc: Check;
  mx: Check;
  score: number; // 0-100
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^.*@/, '') // allow pasting an email
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '');
}

export async function checkDomain(domain: string): Promise<DomainCheck> {
  const [root, dmarcTxt, mx, dkimResults] = await Promise.all([
    txt(domain),
    txt('_dmarc.' + domain),
    mxOf(domain),
    Promise.all(DKIM_SELECTORS.map(async (s) => ({ s, recs: await txt(`${s}._domainkey.${domain}`) })))
  ]);
  const spf = root.find((t) => /v=spf1/i.test(t));
  const dmarc = dmarcTxt.find((t) => /v=DMARC1/i.test(t));
  const dk = dkimResults.find((d) => d.recs.some((t) => /(v=DKIM1|p=[A-Za-z0-9])/i.test(t)));

  const spfC: Check = { ok: !!spf, detail: spf ? spf.slice(0, 140) : 'Missing — add a TXT record beginning with v=spf1' };
  const dkimC: Check = { ok: !!dk, detail: dk ? `Found (selector "${dk.s}")` : 'Not found at common selectors — enable DKIM with your email provider' };
  const dmarcC: Check = { ok: !!dmarc, detail: dmarc ? dmarc.slice(0, 140) : 'Missing — add _dmarc TXT: v=DMARC1; p=none; rua=mailto:you@domain' };
  const mxC: Check = { ok: mx.length > 0, detail: mx.length ? mx.map((m) => m.exchange).slice(0, 3).join(', ') : 'No MX records found' };

  const score = (spfC.ok ? 30 : 0) + (dkimC.ok ? 30 : 0) + (dmarcC.ok ? 25 : 0) + (mxC.ok ? 15 : 0);
  return { domain, spf: spfC, dkim: dkimC, dmarc: dmarcC, mx: mxC, score };
}
