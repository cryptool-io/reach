import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { error, fail } from '@sveltejs/kit';
import { enrollProspects, dueEnrollments, markEvent, campaignStats, pickVersion } from '$lib/campaigns/engine';
import { renderTemplate } from '$lib/snippets';
import { dispatchStep } from '$lib/campaigns/dispatch';
import { parseFieldSchema } from '$lib/presets';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { order: 'asc' }, include: { versions: { orderBy: { label: 'asc' } } } }
    }
  });
  if (!campaign) throw error(404, 'campaign not found');

  const [enrollments, prospects, due, stats] = await Promise.all([
    db.campaignEnrollment.findMany({
      where: { campaignId: campaign.id },
      include: { prospect: true },
      orderBy: { createdAt: 'desc' }
    }),
    db.prospect.findMany({
      where: { projectId: campaign.projectId },
      orderBy: { updatedAt: 'desc' }
    }),
    dueEnrollments(campaign.id),
    campaignStats(campaign.id)
  ]);

  // Build the rendered preview for each due item (current step + chosen A/B version)
  const queue = due.map((e) => {
    const step = campaign.steps.find((s) => s.order === e.currentStep);
    const version = step ? pickVersion(step.versions) : undefined;
    const subj = version ? renderTemplate(version.subject, e.prospect) : { text: '', missing: [] };
    const body = version ? renderTemplate(version.body, e.prospect) : { text: '', missing: [] };
    return {
      enrollmentId: e.id,
      prospect: e.prospect,
      stepOrder: e.currentStep,
      channel: step?.channel ?? 'email',
      versionLabel: version?.label ?? '—',
      versionId: version?.id ?? null,
      subject: subj.text,
      body: body.text,
      missing: [...new Set([...subj.missing, ...body.missing])]
    };
  });

  const project = await db.project.findUnique({ where: { id: campaign.projectId } });
  const fieldKeys = parseFieldSchema(project?.fieldSchemaJson ?? '[]').map((f) => f.key);

  // send-readiness, so the campaign page can show exactly what's needed to launch
  const [mailboxCount, emailChannel] = await Promise.all([
    db.mailbox.count({ where: { projectId: campaign.projectId, status: 'active' } }),
    db.channel.findFirst({ where: { projectId: campaign.projectId, kind: 'email' } })
  ]);

  const tab = url.searchParams.get('tab') ?? 'prospects';
  return { campaign, enrollments, prospects, queue, stats, tab, fieldKeys, mailboxCount, emailMode: emailChannel?.mode ?? 'manual' };
};

export const actions: Actions = {
  // ── settings / status ──────────────────────────────────────────────
  updateSettings: async ({ request, params }) => {
    const f = await request.formData();
    const bool = (k: string) => f.get(k) === 'on' || f.get(k) === 'true';
    const intOf = (k: string, d: number) => {
      const n = parseInt(String(f.get(k) ?? ''), 10);
      return Number.isFinite(n) ? n : d;
    };
    const sendDays = f.getAll('sendDays').map((d) => parseInt(String(d), 10));
    await db.campaign.update({
      where: { id: params.id },
      data: {
        mailbox: String(f.get('mailbox') ?? ''),
        dailyLimit: intOf('dailyLimit', 50),
        intervalMinMinutes: intOf('intervalMinMinutes', 5),
        intervalMaxMinutes: intOf('intervalMaxMinutes', 15),
        sendDaysJson: JSON.stringify(sendDays.length ? sendDays : [1, 2, 3, 4, 5]),
        sendFrom: String(f.get('sendFrom') ?? '09:00'),
        sendTo: String(f.get('sendTo') ?? '17:00'),
        timezone: String(f.get('timezone') ?? 'Europe/London'),
        perProspectTimezone: bool('perProspectTimezone'),
        adaptiveSending: bool('adaptiveSending'),
        stopOnReply: bool('stopOnReply'),
        stopOnClick: bool('stopOnClick'),
        autoreplyReschedule: bool('autoreplyReschedule'),
        trackOpens: bool('trackOpens'),
        trackClicks: bool('trackClicks'),
        trackingDomain: String(f.get('trackingDomain') ?? ''),
        warmupEnabled: bool('warmupEnabled'),
        spamCheck: bool('spamCheck'),
        unsubMessage: String(f.get('unsubMessage') ?? ''),
        detectEmptyFields: bool('detectEmptyFields'),
        detectDuplicates: bool('detectDuplicates')
      }
    });
    return { ok: 'settings' };
  },

  setStatus: async ({ request, params }) => {
    const f = await request.formData();
    const status = String(f.get('status') ?? '');
    if (!['draft', 'running', 'paused', 'completed'].includes(status)) return fail(400);
    const campaign = await db.campaign.update({ where: { id: params.id }, data: { status } });
    // Smart start: flip the project's Email channel to Auto so the scheduler can send
    // (one less hidden step in Settings). Mailboxes still required — surfaced on the page.
    if (status === 'running') {
      await db.channel.updateMany({
        where: { projectId: campaign.projectId, kind: 'email' },
        data: { mode: 'auto' }
      });
    }
    return { ok: 'status' };
  },

  // ── sequence: steps + versions ─────────────────────────────────────
  addStep: async ({ params }) => {
    const last = await db.campaignStep.findFirst({
      where: { campaignId: params.id },
      orderBy: { order: 'desc' }
    });
    const order = (last?.order ?? 0) + 1;
    if (order > 16) return fail(400, { error: 'Max 16 steps' });
    const step = await db.campaignStep.create({
      data: {
        campaignId: params.id!,
        order,
        channel: 'email',
        delayDays: order === 1 ? 0 : 3,
        condition: order === 1 ? 'always' : 'if-no-reply'
      }
    });
    await db.campaignStepVersion.create({ data: { stepId: step.id, label: 'A' } });
    return { ok: 'step-add' };
  },

  updateStep: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('stepId') ?? '');
    if (!id) return fail(400);
    const condition = String(f.get('condition') ?? 'always');
    const waitable = condition === 'if-opened' || condition === 'if-clicked';
    const waitDays = parseInt(String(f.get('waitTimeoutDays') ?? ''), 10);
    const onTimeout = String(f.get('onTimeout') ?? 'skip');
    await db.campaignStep.update({
      where: { id },
      data: {
        channel: String(f.get('channel') ?? 'email'),
        delayDays: parseInt(String(f.get('delayDays') ?? '0'), 10) || 0,
        condition,
        // Wait-config only applies to engagement conditions; reset it otherwise.
        waitForCondition: waitable && (f.get('waitForCondition') === 'on' || f.get('waitForCondition') === 'true'),
        waitTimeoutHours: Number.isFinite(waitDays) ? Math.max(0, waitDays) * 24 : 72,
        onTimeout: onTimeout === 'send' ? 'send' : 'skip'
      }
    });
    return { ok: 'step-update' };
  },

  deleteStep: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('stepId') ?? '');
    if (!id) return fail(400);
    await db.campaignStep.delete({ where: { id } });
    return { ok: 'step-del' };
  },

  addVersion: async ({ request }) => {
    const f = await request.formData();
    const stepId = String(f.get('stepId') ?? '');
    if (!stepId) return fail(400);
    const count = await db.campaignStepVersion.count({ where: { stepId } });
    if (count >= 5) return fail(400, { error: 'Max 5 versions per step' });
    const label = String.fromCharCode(65 + count); // A,B,C,D,E
    await db.campaignStepVersion.create({ data: { stepId, label } });
    return { ok: 'version-add' };
  },

  updateVersion: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('versionId') ?? '');
    if (!id) return fail(400);
    await db.campaignStepVersion.update({
      where: { id },
      data: { subject: String(f.get('subject') ?? ''), body: String(f.get('body') ?? '') }
    });
    return { ok: 'version-update' };
  },

  deleteVersion: async ({ request }) => {
    const f = await request.formData();
    const id = String(f.get('versionId') ?? '');
    if (!id) return fail(400);
    await db.campaignStepVersion.delete({ where: { id } });
    return { ok: 'version-del' };
  },

  // ── prospects: enroll ──────────────────────────────────────────────
  enroll: async ({ request, params }) => {
    const f = await request.formData();
    const mode = String(f.get('mode') ?? 'selected'); // all | stage | selected
    const campaign = await db.campaign.findUniqueOrThrow({ where: { id: params.id } });

    let ids: string[] = [];
    if (mode === 'all') {
      ids = (await db.prospect.findMany({ where: { projectId: campaign.projectId }, select: { id: true } })).map((p) => p.id);
    } else if (mode === 'stage') {
      const stage = String(f.get('stage') ?? '');
      ids = (await db.prospect.findMany({ where: { projectId: campaign.projectId, stage }, select: { id: true } })).map((p) => p.id);
    } else {
      ids = f.getAll('prospectId').map(String);
    }
    if (ids.length === 0) return fail(400, { error: 'no prospects selected' });
    const res = await enrollProspects(params.id!, ids);
    return { ok: 'enroll', ...res };
  },

  // ── queue: send the current step (manual) ──────────────────────────
  sendStep: async ({ request }) => {
    const f = await request.formData();
    const enrollmentId = String(f.get('enrollmentId') ?? '');
    const versionId = String(f.get('versionId') ?? '') || null;
    if (!enrollmentId) return fail(400, { error: 'enrollment required' });

    const r = await dispatchStep(enrollmentId, { trigger: 'manual', versionId });
    if (!r.ok) {
      const msg =
        r.reason === 'missing-fields'
          ? `Missing snippet(s): ${r.missing?.join(', ')}. Fill the field or turn off empty-field detection.`
          : `Could not send (${r.reason}).`;
      return fail(400, { error: msg });
    }
    return { ok: 'sent' };
  },

  // ── inbox: mark reply / interest / bounce / opt-out ────────────────
  markEvent: async ({ request }) => {
    const f = await request.formData();
    const enrollmentId = String(f.get('enrollmentId') ?? '');
    const event = String(f.get('event') ?? '') as 'replied' | 'bounced' | 'opted-out' | 'paused' | 'active';
    const interest = String(f.get('interest') ?? '') || undefined;
    if (!enrollmentId) return fail(400);
    await markEvent(enrollmentId, event, interest);
    return { ok: 'event' };
  }
};
