import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { error, fail } from '@sveltejs/kit';
import { compose } from '$lib/composer';
import { getAdapter } from '$lib/channels';
import { CHANNEL_KINDS, INTENTS, STAGES, type ChannelKind, type Intent } from '$lib/types';
import { parseFieldSchema } from '$lib/presets';
import { runJsonAgent, fetchPublicText } from '$lib/agents';

export const load: PageServerLoad = async ({ params }) => {
  const prospect = await db.prospect.findUnique({
    where: { id: params.id },
    include: {
      conversations: {
        include: {
          channel: true,
          messages: { orderBy: { createdAt: 'asc' } }
        },
        orderBy: { lastAt: 'desc' }
      },
      notes: { orderBy: { createdAt: 'desc' } },
      tasks: { where: { status: 'open' }, orderBy: { dueAt: 'asc' } }
    }
  });
  if (!prospect) throw error(404, 'prospect not found');

  const project = await db.project.findUniqueOrThrow({ where: { id: prospect.projectId } });
  const channels = await db.channel.findMany({ where: { projectId: prospect.projectId } });
  const assets = await db.contentAsset.findMany({ where: { projectId: prospect.projectId } });
  const fields = parseFieldSchema(project.fieldSchemaJson);

  // Warm-intro paths: your connections at the same company/fund as this prospect.
  let introPaths: { id: string; name: string; title: string; company: string; strength: number }[] = [];
  if (prospect.company) {
    const target = prospect.company.toLowerCase().trim();
    const conns = await db.connection.findMany({ where: { projectId: prospect.projectId } });
    introPaths = conns
      .filter((c) => c.company && (c.company.toLowerCase().includes(target) || target.includes(c.company.toLowerCase())))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 8)
      .map((c) => ({ id: c.id, name: c.name, title: c.title, company: c.company, strength: c.strength }));
  }

  return { prospect, project, channels, assets, fields, introPaths };
};

export const actions: Actions = {
  updateStage: async ({ request, params }) => {
    const f = await request.formData();
    const stage = String(f.get('stage') ?? '');
    if (!STAGES.includes(stage as (typeof STAGES)[number])) return fail(400, { error: 'bad stage' });
    await db.prospect.update({ where: { id: params.id }, data: { stage } });
    return { ok: true };
  },

  addNote: async ({ request, params }) => {
    const f = await request.formData();
    const body = String(f.get('body') ?? '').trim();
    if (!body) return fail(400, { error: 'body required' });
    await db.note.create({ data: { prospectId: params.id!, body } });
    return { ok: true };
  },

  updateFields: async ({ request, params }) => {
    const prospect = await db.prospect.findUniqueOrThrow({ where: { id: params.id } });
    const project = await db.project.findUniqueOrThrow({ where: { id: prospect.projectId } });
    const f = await request.formData();
    const custom: Record<string, string> = {};
    for (const field of parseFieldSchema(project.fieldSchemaJson)) {
      const v = String(f.get(`custom.${field.key}`) ?? '').trim();
      if (v) custom[field.key] = v;
    }
    await db.prospect.update({ where: { id: params.id }, data: { customJson: JSON.stringify(custom) } });
    return { ok: true };
  },

  // ── Intelligence + Enrichment ──────────────────────────────────────
  research: async ({ params }) => {
    const prospect = await db.prospect.findUniqueOrThrow({ where: { id: params.id } });
    const project = await db.project.findUniqueOrThrow({ where: { id: prospect.projectId } });

    // Best-effort public context (LinkedIn usually blocks; company/personal sites may work)
    let fetched = '';
    for (const url of [prospect.linkedinUrl, ...Object.values(JSON.parse(prospect.customJson || '{}'))]
      .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, 2)) {
      const t = await fetchPublicText(url);
      if (t) fetched += `\n[${url}]\n${t}\n`;
    }

    let res;
    try {
      res = await runJsonAgent<{ brief: string; angle: string; talking_points: string[]; score: number; confidence: string }>(
        prospect.projectId,
        'intelligence.brief',
        {
          narrative: project.narrativeMd || '(none)',
          icp: project.icpMd || '(none)',
          'prospect.name': prospect.name,
          'prospect.company': prospect.company || '(unknown)',
          'prospect.role': prospect.role || '(unknown)',
          'prospect.fields': prospect.customJson || '{}',
          'prospect.handles': [prospect.email, prospect.linkedinUrl, prospect.xHandle].filter(Boolean).join(', ') || '(none)',
          fetched: fetched || '(no public material retrieved — base the brief on the fields above and mark confidence accordingly)'
        }
      );
    } catch (e) {
      return fail(500, { error: (e as Error).message });
    }
    if (!res.data) return fail(502, { error: 'Could not parse the research result. Try again.' });

    const d = res.data;
    const body =
      `**Brief.** ${d.brief}\n\n**Opening angle.** ${d.angle}\n\n` +
      (d.talking_points?.length ? `**Hooks:**\n${d.talking_points.map((p) => `- ${p}`).join('\n')}\n\n` : '') +
      `_Fit score ${d.score ?? '—'}/100 · confidence ${d.confidence ?? '—'}${fetched ? '' : ' · no public page retrieved'}_`;
    await db.note.create({ data: { prospectId: prospect.id, source: 'intelligence', body } });
    if (typeof d.score === 'number') {
      await db.prospect.update({ where: { id: prospect.id }, data: { score: Math.max(0, Math.min(100, Math.round(d.score))) } });
    }
    return { ok: 'researched', angle: d.angle };
  },

  // ── Call Debrief ───────────────────────────────────────────────────
  debrief: async ({ request, params }) => {
    const f = await request.formData();
    const transcript = String(f.get('transcript') ?? '').trim();
    if (!transcript) return fail(400, { error: 'paste the call transcript or notes' });
    const prospect = await db.prospect.findUniqueOrThrow({ where: { id: params.id } });
    const project = await db.project.findUniqueOrThrow({ where: { id: prospect.projectId } });

    let res;
    try {
      res = await runJsonAgent<{
        summary: string;
        objections: string[];
        next_step: string;
        follow_up_days: number;
        suggested_stage: string;
        sentiment: string;
      }>(prospect.projectId, 'debrief.summary', {
        narrative: project.narrativeMd || '(none)',
        'prospect.name': prospect.name,
        'prospect.company': prospect.company || '(unknown)',
        'prospect.role': prospect.role || '(unknown)',
        'prospect.stage': prospect.stage,
        transcript
      });
    } catch (e) {
      return fail(500, { error: (e as Error).message });
    }
    if (!res.data) return fail(502, { error: 'Could not parse the debrief. Try again.' });
    const d = res.data;

    const body =
      `**Call debrief.** ${d.summary}\n\n` +
      (d.objections?.length ? `**Objections:**\n${d.objections.map((o) => `- ${o}`).join('\n')}\n\n` : '') +
      `**Next step.** ${d.next_step}\n\n_Sentiment: ${d.sentiment ?? '—'}_`;
    await db.note.create({ data: { prospectId: prospect.id, source: 'call-debrief', body } });

    // Update stage if suggested + valid
    if (d.suggested_stage && STAGES.includes(d.suggested_stage as (typeof STAGES)[number])) {
      await db.prospect.update({ where: { id: prospect.id }, data: { stage: d.suggested_stage } });
    }
    // Create a follow-up task
    if (d.next_step) {
      const due =
        typeof d.follow_up_days === 'number' && d.follow_up_days > 0
          ? new Date(Date.now() + d.follow_up_days * 86400000)
          : null;
      await db.task.create({
        data: {
          projectId: prospect.projectId,
          prospectId: prospect.id,
          kind: 'follow-up',
          title: d.next_step.slice(0, 200),
          dueAt: due
        }
      });
    }
    return { ok: 'debriefed', stage: d.suggested_stage };
  },

  draft: async ({ request, params }) => {
    const f = await request.formData();
    const intent = String(f.get('intent') ?? '') as Intent;
    const channelKind = String(f.get('channelKind') ?? '') as ChannelKind;
    if (!INTENTS.includes(intent)) return fail(400, { error: 'bad intent' });
    if (!CHANNEL_KINDS.includes(channelKind)) return fail(400, { error: 'bad channel' });

    const prospect = await db.prospect.findUniqueOrThrow({ where: { id: params.id } });
    const channel = await db.channel.findFirstOrThrow({
      where: { projectId: prospect.projectId, kind: channelKind }
    });

    // Build thread context from any prior conversation on this channel
    const convo = await db.conversation.findFirst({
      where: { prospectId: prospect.id, channelId: channel.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 10 } }
    });
    const thread = convo?.messages
      .map((m) => `[${m.direction === 'in' ? prospect.name : 'You'}]: ${m.body}`)
      .join('\n\n');

    let drafts;
    try {
      drafts = await compose({
        projectId: prospect.projectId,
        prospectId: prospect.id,
        channelKind,
        intent,
        threadContext: thread
      });
    } catch (err) {
      return fail(500, { error: (err as Error).message });
    }

    return { drafts, intent, channelKind };
  },

  send: async ({ request, params }) => {
    const f = await request.formData();
    const body = String(f.get('body') ?? '');
    const channelKind = String(f.get('channelKind') ?? '') as ChannelKind;
    const intent = String(f.get('intent') ?? '') as Intent;
    if (!body) return fail(400, { error: 'body required' });

    const prospect = await db.prospect.findUniqueOrThrow({ where: { id: params.id } });
    const channel = await db.channel.findFirstOrThrow({
      where: { projectId: prospect.projectId, kind: channelKind }
    });

    const conversation = await db.conversation.upsert({
      where: { prospectId_channelId: { prospectId: prospect.id, channelId: channel.id } },
      create: {
        projectId: prospect.projectId,
        prospectId: prospect.id,
        channelId: channel.id
      },
      update: { lastAt: new Date() }
    });

    const handle =
      channelKind === 'email'
        ? prospect.email
        : channelKind === 'linkedin'
          ? prospect.linkedinUrl
          : channelKind === 'x'
            ? prospect.xHandle
            : channelKind === 'telegram'
              ? prospect.telegram
              : prospect.discord;

    const adapter = getAdapter(channelKind);
    const result = await adapter.send(
      { to: { name: prospect.name, handle: handle || '' }, body, subject: '' },
      channel.mode as 'manual' | 'semi' | 'auto',
      { projectId: prospect.projectId }
    );

    await db.message.create({
      data: {
        conversationId: conversation.id,
        channelId: channel.id,
        direction: 'out',
        body,
        status: result.status === 'sent' ? 'sent' : 'draft',
        sentAt: result.status === 'sent' ? new Date() : null,
        draftMetaJson: JSON.stringify({ intent, openUrl: result.openUrl, note: result.note })
      }
    });

    // Bump stage to 'contacted' if it was earlier
    if (['new', 'researching'].includes(prospect.stage)) {
      await db.prospect.update({ where: { id: prospect.id }, data: { stage: 'contacted' } });
    }

    return { sent: true, openUrl: result.openUrl, note: result.note };
  }
};
