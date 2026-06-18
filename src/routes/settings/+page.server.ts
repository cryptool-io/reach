import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODES, INTENT_LABEL } from '$lib/types';
import { parseFieldSchema, normalizeKey, type FieldDef } from '$lib/presets';
import { allProjectPrompts, PROMPT_DEFAULTS } from '$lib/prompts';
import { hashPassword, verifyPassword } from '$lib/auth';

// Tail of the last GitHub deploy run (written by deploy/pull-deploy.sh on the server).
function readDeployLog(): string {
  try {
    return readFileSync(join(process.cwd(), 'deploy/last-deploy.log'), 'utf8').split('\n').slice(-80).join('\n').trim();
  } catch {
    return '';
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  const account = {
    user: locals.user ?? null,
    deployLog: readDeployLog(),
    // Only offer the GitHub deploy once the app dir is actually a git clone on the server.
    canDeploy: process.env.NODE_ENV === 'production' && existsSync(join(process.cwd(), '.git'))
  };
  if (!locals.activeProjectId)
    return { project: null, channels: [], assets: [], fields: [], prompts: [], intentLabel: INTENT_LABEL, ...account };
  const [project, channels, assets, prompts] = await Promise.all([
    db.project.findUnique({ where: { id: locals.activeProjectId } }),
    db.channel.findMany({ where: { projectId: locals.activeProjectId } }),
    db.contentAsset.findMany({ where: { projectId: locals.activeProjectId } }),
    allProjectPrompts(locals.activeProjectId)
  ]);
  return {
    project,
    channels,
    assets,
    fields: parseFieldSchema(project?.fieldSchemaJson ?? '[]'),
    prompts,
    intentLabel: INTENT_LABEL,
    ...account
  };
};

export const actions: Actions = {
  updateProject: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    await db.project.update({
      where: { id: locals.activeProjectId },
      data: {
        name: String(f.get('name') ?? '').trim() || undefined,
        narrativeMd: String(f.get('narrativeMd') ?? ''),
        icpMd: String(f.get('icpMd') ?? ''),
        modeDefault: String(f.get('modeDefault') ?? 'manual')
      }
    });
    return { ok: 'project' };
  },

  updateChannel: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    const mode = String(f.get('mode') ?? 'manual');
    const status = String(f.get('status') ?? 'disconnected');
    if (!MODES.includes(mode as (typeof MODES)[number])) return fail(400);
    await db.channel.update({ where: { id }, data: { mode, status } });
    return { ok: 'channel' };
  },

  addAsset: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const url = String(f.get('url') ?? '').trim();
    const title = String(f.get('title') ?? '').trim();
    const kind = String(f.get('kind') ?? 'link');
    if (!url || !title) return fail(400);
    await db.contentAsset.create({
      data: { projectId: locals.activeProjectId, url, title, kind }
    });
    return { ok: 'asset' };
  },

  deleteAsset: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return fail(400);
    await db.contentAsset.delete({ where: { id } });
    return { ok: 'asset-del' };
  },

  // ── custom fields ──────────────────────────────────────────────────
  addField: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const label = String(f.get('label') ?? '').trim();
    const type = String(f.get('type') ?? 'text');
    if (!label) return fail(400, { error: 'label required' });
    const key = normalizeKey(String(f.get('key') ?? '') || label);
    if (!key) return fail(400, { error: 'invalid key' });

    const project = await db.project.findUniqueOrThrow({ where: { id: locals.activeProjectId } });
    const fields = parseFieldSchema(project.fieldSchemaJson);
    if (fields.some((x) => x.key === key)) return fail(400, { error: `field "${key}" already exists` });
    fields.push({ key, label, type: (['text', 'number', 'url'].includes(type) ? type : 'text') as FieldDef['type'] });
    await db.project.update({ where: { id: project.id }, data: { fieldSchemaJson: JSON.stringify(fields) } });
    return { ok: 'field-add' };
  },

  deleteField: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const key = String(f.get('key') ?? '');
    const project = await db.project.findUniqueOrThrow({ where: { id: locals.activeProjectId } });
    const fields = parseFieldSchema(project.fieldSchemaJson).filter((x) => x.key !== key);
    await db.project.update({ where: { id: project.id }, data: { fieldSchemaJson: JSON.stringify(fields) } });
    return { ok: 'field-del' };
  },

  // ── AI prompts ─────────────────────────────────────────────────────
  savePrompt: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const slot = String(f.get('slot') ?? '');
    const body = String(f.get('body') ?? '');
    if (!slot.startsWith('composer.')) return fail(400, { error: 'bad slot' });
    await db.promptTemplate.upsert({
      where: { projectId_slot_version: { projectId: locals.activeProjectId, slot, version: 1 } },
      create: { projectId: locals.activeProjectId, slot, version: 1, body },
      update: { body }
    });
    return { ok: 'prompt' };
  },

  resetPrompt: async ({ request, locals }) => {
    if (!locals.activeProjectId) return fail(400);
    const f = await request.formData();
    const slot = String(f.get('slot') ?? '');
    const body = PROMPT_DEFAULTS[slot]?.body;
    if (!body) return fail(400, { error: 'unknown slot' });
    await db.promptTemplate.upsert({
      where: { projectId_slot_version: { projectId: locals.activeProjectId, slot, version: 1 } },
      create: { projectId: locals.activeProjectId, slot, version: 1, body },
      update: { body }
    });
    return { ok: 'prompt-reset' };
  },

  // ── account: change own password ───────────────────────────────────
  changePassword: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { pwError: 'Not signed in.' });
    const f = await request.formData();
    const current = String(f.get('currentPassword') ?? '');
    const next = String(f.get('newPassword') ?? '');
    if (next.length < 8) return fail(400, { pwError: 'New password must be at least 8 characters.' });
    const user = await db.user.findUnique({ where: { id: locals.user.id } });
    if (!user || !verifyPassword(current, user.passwordHash))
      return fail(400, { pwError: 'Current password is incorrect.' });
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } });
    return { ok: 'password' };
  },

  // ── deployment: pull latest from GitHub + rebuild + reload (server only) ──
  deploy: async ({ locals }) => {
    if (!locals.user) return fail(401);
    if (process.env.NODE_ENV !== 'production')
      return fail(400, { deployError: 'Deploy is only available on the production server.' });
    const { spawn } = await import('node:child_process');
    const script = join(process.cwd(), 'deploy/pull-deploy.sh');
    // Detached so it survives the pm2 reload it performs at the end. It logs to deploy/last-deploy.log.
    const child = spawn('bash', [script], { detached: true, stdio: 'ignore', cwd: process.cwd() });
    child.unref();
    return { ok: 'deploy-started' };
  }
};

