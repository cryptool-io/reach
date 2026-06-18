import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { fail, redirect } from '@sveltejs/kit';
import { setActiveProject } from '$lib/active-project';
import { CHANNEL_KINDS, INTENTS, type ChannelKind } from '$lib/types';
import { getPreset, PRESETS } from '$lib/presets';
import { COMPOSER_DEFAULT } from '$lib/prompts';

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export const load: PageServerLoad = async () => {
  const projects = await db.project.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { prospects: true, conversations: true, channels: true } } }
  });
  return {
    projects,
    presets: PRESETS.map((p) => ({ id: p.id, label: p.label, description: p.description, fieldCount: p.fields.length }))
  };
};

export const actions: Actions = {
  create: async ({ request, cookies }) => {
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim();
    const narrativeMd = String(f.get('narrativeMd') ?? '');
    const icpMd = String(f.get('icpMd') ?? '');
    const presetId = String(f.get('preset') ?? 'blank');
    if (!name) return fail(400, { error: 'name required' });

    const preset = getPreset(presetId);

    const baseSlug = slugify(name) || 'project';
    let slug = baseSlug;
    let n = 2;
    while (await db.project.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${n++}`;
    }

    const project = await db.project.create({
      data: {
        name,
        slug,
        narrativeMd,
        icpMd,
        preset: preset.id,
        fieldSchemaJson: JSON.stringify(preset.fields)
      }
    });

    // bootstrap one row per channel kind, all disconnected/manual
    await db.channel.createMany({
      data: (CHANNEL_KINDS as readonly ChannelKind[]).map((kind) => ({
        projectId: project.id,
        kind,
        status: 'disconnected',
        mode: 'manual'
      }))
    });

    // seed editable AI prompt templates (copies of the defaults) so Messaging settings is populated
    await db.promptTemplate.createMany({
      data: INTENTS.map((intent) => ({
        projectId: project.id,
        slot: `composer.${intent}`,
        version: 1,
        body: COMPOSER_DEFAULT(intent)
      }))
    });

    // seed the preset's starter cadences
    for (const c of preset.cadences) {
      await db.cadence.create({
        data: { projectId: project.id, name: c.name, stepsJson: JSON.stringify(c.steps) }
      });
    }

    setActiveProject(cookies, slug);
    throw redirect(303, '/');
  },
  delete: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('id') ?? '');
    if (!id) return fail(400, { error: 'id required' });
    await db.project.delete({ where: { id } });
    return { ok: true };
  }
};
