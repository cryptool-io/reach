// Apollo.io people search — licensed, verified B2B contact data via the official API.
// Keyed by APOLLO_API_KEY. Server-only (reads $env). The compliant way to source investor
// contacts: Apollo provides the data under its own terms, you supply your API key.

import { env } from '$env/dynamic/private';

export function apolloConfigured(): boolean {
  return !!env.APOLLO_API_KEY && env.APOLLO_API_KEY.trim().length > 0;
}

export interface ApolloPerson {
  name: string;
  firstName: string;
  title: string;
  company: string;
  domain: string;
  email: string; // '' when locked / not revealed by your plan
  emailStatus: string;
  linkedinUrl: string;
  location: string;
}

export interface ApolloSearch {
  titles?: string[];
  keywords?: string;
  locations?: string[];
  page?: number;
  perPage?: number;
}

function looksReal(e: unknown): e is string {
  return typeof e === 'string' && /@/.test(e) && !/not_unlocked|email_not_unlocked|^email@/i.test(e);
}

export async function searchApolloPeople(s: ApolloSearch): Promise<{ people: ApolloPerson[]; total: number; page: number }> {
  const key = env.APOLLO_API_KEY?.trim();
  if (!key) throw new Error('APOLLO_API_KEY is not set — add it to the server .env to enable Apollo search.');

  const page = s.page && s.page > 0 ? s.page : 1;
  const body: Record<string, unknown> = { page, per_page: Math.min(s.perPage ?? 25, 100) };
  if (s.titles?.length) body.person_titles = s.titles;
  if (s.keywords?.trim()) body.q_keywords = s.keywords.trim();
  if (s.locations?.length) body.person_locations = s.locations;

  const r = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', 'x-api-key': key },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Apollo ${r.status}: ${t.slice(0, 200) || 'request failed'}`);
  }
  const data = (await r.json()) as {
    people?: Record<string, any>[];
    pagination?: { total_entries?: number };
  };
  const people: ApolloPerson[] = (data.people ?? []).map((p) => ({
    name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' '),
    firstName: p.first_name || '',
    title: p.title || '',
    company: p.organization?.name || p.account?.name || '',
    domain: String(p.organization?.primary_domain || p.organization?.website_url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    email: looksReal(p.email) ? p.email : '',
    emailStatus: p.email_status || (looksReal(p.email) ? 'verified' : 'locked'),
    linkedinUrl: p.linkedin_url || '',
    location: [p.city, p.state, p.country].filter(Boolean).join(', ')
  }));
  return { people, total: data.pagination?.total_entries ?? people.length, page };
}
