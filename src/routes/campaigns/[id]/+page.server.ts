import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { error, fail } from '@sveltejs/kit';
import { enrollProspects, dueEnrollments, markEvent, campaignStats, pickVersion } from '$lib/campaigns/engine';
import { renderTemplate } from '$lib/snippets';
import { dispatchStep } from '$lib/campaigns/dispatch';
import { sendProjectEmail } from '$lib/mailboxes';
import { spamCheck } from '$lib/spamCheck';
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
  const templates = await db.template.findMany({
    where: { projectId: campaign.projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, subject: true, body: true }
  });

  // send-readiness, so the campaign page can show exactly what's needed to launch
  const [mailboxCount, emailChannel] = await Promise.all([
    db.mailbox.count({ where: { projectId: campaign.projectId, status: 'active' } }),
    db.channel.findFirst({ where: { projectId: campaign.projectId, kind: 'email' } })
  ]);

  const tab = url.searchParams.get('tab') ?? 'prospects';
  return { campaign, enrollments, prospects, queue, stats, tab, fieldKeys, templates, mailboxCount, emailMode: emailChannel?.mode ?? 'manual' };
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

    // Spam-check launch guard: when the campaign has spam-check on, block going live if any
    // version's copy scores "high". The user can lower the score or turn the toggle off.
    if (status === 'running') {
      const full = await db.campaign.findUnique({
        where: { id: params.id },
        include: { steps: { orderBy: { order: 'asc' }, include: { versions: { orderBy: { label: 'asc' } } } } }
      });
      if (full?.spamCheck) {
        const flagged: string[] = [];
        for (const s of full.steps)
          for (const v of s.versions) {
            const r = spamCheck(v.subject, v.body);
            if (r.level === 'high') flagged.push(`Step ${s.order}${v.label}: ${r.issues.join('; ')}`);
          }
        if (flagged.length)
          return fail(400, { error: `Spam check blocked launch (edit the copy, or turn off spam-check in Delivery):\n• ${flagged.join('\n• ')}` });
      }
    }

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

  // ── per-step send test: render this version's copy for a sample prospect and send it to a
  //    test address, WITHOUT enrolling anyone or advancing the sequence. ────────────────────
  sendTest: async ({ request }) => {
    const f = await request.formData();
    const versionId = String(f.get('versionId') ?? '');
    const to = String(f.get('to') ?? '').trim();
    if (!versionId || !to) return fail(400, { error: 'A test recipient address is required.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return fail(400, { error: 'Enter a valid test email address.' });

    const version = await db.campaignStepVersion.findUnique({
      where: { id: versionId },
      include: { step: { include: { campaign: true } } }
    });
    if (!version) return fail(404, { error: 'Version not found.' });
    const campaign = version.step.campaign;

    // Snippet data: the most-recent real prospect if any, else a sample so {{tags}} resolve.
    const real = await db.prospect.findFirst({
      where: { projectId: campaign.projectId },
      orderBy: { updatedAt: 'desc' }
    });
    const ctx =
      real ??
      ({
        name: 'Alex Sample', company: 'Acme Inc', role: 'Head of Growth', email: to,
        linkedinUrl: '', xHandle: '', telegram: '', discord: '', customJson: '{}'
      } as Parameters<typeof renderTemplate>[1]);

    const subj = renderTemplate(version.subject, ctx).text;
    const body = renderTemplate(version.body, ctx).text;
    const header = `[TEST] ${campaign.name} · step ${version.step.order} · version ${version.label}\n` +
      `(rendered with ${real ? real.name : 'sample'} data — not enrolled, not counted)\n\n`;
    const r = await sendProjectEmail(campaign.projectId, {
      to,
      subject: subj ? `[test] ${subj}` : `[test] ${campaign.name}`,
      body: header + body
    });
    if (!r.ok)
      return fail(400, {
        error:
          r.reason === 'no-capacity'
            ? 'No mailbox capacity right now — every mailbox is at its daily cap. Add a mailbox or wait.'
            : `Test send failed: ${r.detail ?? r.reason}`
      });
    return { ok: 'sendtest', detail: `Test sent to ${to} via ${r.mailbox}.` };
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
