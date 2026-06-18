import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.activeProjectId) return { connections: [], count: 0 };
  const connections = await db.connection.findMany({
    where: { projectId: locals.activeProjectId },
    orderBy: { name: 'asc' },
    take: 500
  });
  const count = await db.connection.count({ where: { projectId: locals.activeProjectId } });
  return { connections, count };
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === ',') { out.push(cur); cur = ''; }
    else if (c === '"') inQ = true;
    else cur += c;
  }
  out.push(cur);
  return out;
}

export const actions: Actions = {
  // LinkedIn "Connections.csv" export has columns: First Name, Last Name, Company, Position, Email Address, URL
  importCsv: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const csv = String(f.get('csv') ?? '').trim();
    if (!csv) return fail(400, { error: 'paste your connections CSV' });

    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    // LinkedIn prepends notes lines before the header — find the header row.
    const headerIdx = lines.findIndex((l) => /first name|firstname|name/i.test(l) && /company|position|title|email|url/i.test(l));
    const start = headerIdx >= 0 ? headerIdx : 0;
    const header = parseCsvLine(lines[start]).map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const iFirst = col('first name', 'firstname');
    const iLast = col('last name', 'lastname');
    const iName = col('name', 'full name', 'fullname');
    const iCompany = col('company', 'firm');
    const iTitle = col('position', 'title', 'role');
    const iEmail = col('email address', 'email');
    const iUrl = col('url', 'profile url', 'linkedin');

    const rows = lines.slice(start + 1).map((l) => {
      const c = parseCsvLine(l);
      const at = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
      const name = iName >= 0 ? at(iName) : `${at(iFirst)} ${at(iLast)}`.trim();
      return {
        projectId: locals.activeProjectId!,
        name,
        company: at(iCompany),
        title: at(iTitle),
        email: at(iEmail),
        linkedinUrl: at(iUrl)
      };
    }).filter((r) => r.name);

    if (rows.length === 0) return { imported: 0, error: 'No rows with a name found' };
    await db.connection.createMany({ data: rows });
    return { imported: rows.length };
  },

  clear: async ({ locals }) => {
    if (!locals.activeProjectId) return fail(400);
    await db.connection.deleteMany({ where: { projectId: locals.activeProjectId } });
    return { cleared: true };
  }
};
