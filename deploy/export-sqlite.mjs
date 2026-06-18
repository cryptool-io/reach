// Run LOCALLY (schema provider = sqlite) to dump all tables to deploy/reach-data.json.
//   node deploy/export-sqlite.mjs
// JSON.stringify turns Dates into ISO strings; import-postgres.mjs revives them.
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'node:fs';

const db = new PrismaClient();
// Parent → child order (FK-safe for import).
const MODELS = [
  'user', 'session', 'project', 'mailbox', 'channel', 'prospect', 'conversation',
  'message', 'cadence', 'cadenceRun', 'task', 'note', 'contentAsset', 'connection',
  'promptTemplate', 'networkEdge', 'campaign', 'campaignStep', 'campaignStepVersion',
  'campaignEnrollment', 'campaignSend'
];

const out = {};
for (const m of MODELS) {
  out[m] = await db[m].findMany();
  console.log(`${m}: ${out[m].length}`);
}
const path = new URL('./reach-data.json', import.meta.url);
writeFileSync(path, JSON.stringify(out));
console.log('wrote', path.pathname);
await db.$disconnect();
