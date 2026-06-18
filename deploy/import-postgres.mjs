// Run ON THE SERVER (schema provider = postgresql, DATABASE_URL → reach_db) AFTER `prisma db push`.
//   node --env-file=.env deploy/import-postgres.mjs
// Idempotent (skipDuplicates). Preserves ids + createdAt; @updatedAt fields reset to now (cosmetic).
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const db = new PrismaClient();
const data = JSON.parse(readFileSync(new URL('./reach-data.json', import.meta.url)));
const ORDER = [
  'user', 'session', 'project', 'mailbox', 'channel', 'prospect', 'conversation',
  'message', 'cadence', 'cadenceRun', 'task', 'note', 'contentAsset', 'connection',
  'promptTemplate', 'networkEdge', 'campaign', 'campaignStep', 'campaignStepVersion',
  'campaignEnrollment', 'campaignSend'
];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const revive = (row) => {
  const o = { ...row };
  for (const k in o) if (typeof o[k] === 'string' && ISO.test(o[k])) o[k] = new Date(o[k]);
  return o;
};

const CHUNK = 500;
for (const m of ORDER) {
  const rows = (data[m] || []).map(revive);
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const r = await db[m].createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    n += r.count;
  }
  console.log(`${m}: imported ${n} / ${rows.length}`);
}

console.log('--- verify ---');
let ok = true;
for (const m of ORDER) {
  const have = await db[m].count();
  const want = (data[m] || []).length;
  if (have !== want) ok = false;
  console.log(`${m}: db=${have} json=${want} ${have === want ? 'OK' : 'MISMATCH'}`);
}
console.log(ok ? 'ALL COUNTS MATCH' : 'COUNT MISMATCH — investigate');
await db.$disconnect();
process.exit(ok ? 0 : 1);
