// Shared "send the current step for one enrollment" path.
// Used by the manual Queue action (trigger=manual) and the auto-fire scheduler (trigger=auto).

import { db } from '$lib/db';
import { getAdapter } from '$lib/channels';
import { renderTemplate } from '$lib/snippets';
import { advanceAfterSend, pickVersion, evaluateStepGate } from './engine';
import { sendProjectEmail } from '$lib/mailboxes';
import { trackingBase, buildTrackedHtml } from '$lib/tracking';
import { parseBlacklist, isBlacklisted } from '$lib/blacklist';
import { isSuppressed } from '$lib/suppression';
import { emitEvent } from '$lib/webhooks';
import type { ChannelKind } from '$lib/types';

export function stepChannelKind(ch: string): ChannelKind | null {
  if (ch === 'email') return 'email';
  if (ch.startsWith('linkedin')) return 'linkedin';
  if (ch === 'x') return 'x';
  return null; // call | sms | manual → logged as a note, never auto-sent
}

export interface DispatchResult {
  ok: boolean;
  reason?: string;
  status?: string;
  openUrl?: string;
  note?: string;
  missing?: string[];
}

export async function dispatchStep(
  enrollmentId: string,
  opts: { trigger: 'manual' | 'auto'; versionId?: string | null }
): Promise<DispatchResult> {
  const enr = await db.campaignEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { prospect: true, campaign: { include: { steps: { include: { versions: true } } } } }
  });
  if (!enr) return { ok: false, reason: 'no-enrollment' };
  if (enr.status !== 'active') return { ok: false, reason: 'not-active' };

  const step = enr.campaign.steps.find((s) => s.order === enr.currentStep);
  if (!step) return { ok: false, reason: 'no-step' };

  // Compliance: never send to a blacklisted address/domain, or a suppressed (unsubscribed /
  // bounced) address. Match → terminate the enrollment so it isn't retried, and surface it.
  if (stepChannelKind(step.channel) === 'email') {
    const email = (enr.prospect.email || '').trim();
    const bl = parseBlacklist(enr.campaign.blacklistJson);
    const blocked =
      (bl.length && isBlacklisted(email, bl)) || (await isSuppressed(enr.campaign.projectId, email));
    if (blocked) {
      await db.campaignEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'opted-out', nextActionAt: null, lastEventAt: new Date() }
      });
      return { ok: false, reason: 'suppressed', note: `${email} is suppressed or blacklisted` };
    }
  }

  // Conditional gating (auto only — a human sending from the Queue always overrides).
  //  • plain conditional step → skip-and-advance when the condition isn't met (legacy behaviour)
  //  • wait-step → park the enrollment and re-check until the condition flips or the timeout
  //    elapses; on timeout, either send anyway or skip, per the step's onTimeout.
  if (opts.trigger === 'auto') {
    const now = new Date();
    const gate = evaluateStepGate(step, enr, now);
    if (gate.action === 'wait') {
      await db.campaignEnrollment.update({
        where: { id: enrollmentId },
        data: { waitingSince: enr.waitingSince ?? now, nextActionAt: gate.until }
      });
      return { ok: false, reason: 'condition-wait', note: `waiting for ${step.condition}` };
    }
    if (gate.action === 'skip') {
      await advanceAfterSend(enrollmentId);
      return { ok: false, reason: 'condition-skip', note: gate.reason };
    }
    // gate.action === 'send' → condition met (or timed out with onTimeout=send): fall through.
  }

  const version = (opts.versionId && step.versions.find((v) => v.id === opts.versionId)) || pickVersion(step.versions);
  if (!version) return { ok: false, reason: 'no-version' };

  const bodyR = renderTemplate(version.body, enr.prospect);
  const subjR = renderTemplate(version.subject, enr.prospect);
  if (enr.campaign.detectEmptyFields && (bodyR.missing.length || subjR.missing.length)) {
    return { ok: false, reason: 'missing-fields', missing: [...new Set([...bodyR.missing, ...subjR.missing])] };
  }

  const kind = stepChannelKind(step.channel);
  let status = 'drafted';
  let openUrl: string | undefined;
  let note: string | undefined;
  const meta = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      campaignId: enr.campaignId, projectId: enr.campaign.projectId, step: step.order, version: version.label,
      versionId: version.id, enrollmentId: enr.id, trigger: opts.trigger, ...extra
    });

  if (kind) {
    const channel = await db.channel.findFirst({ where: { projectId: enr.campaign.projectId, kind } });
    if (!channel) return { ok: false, reason: 'no-channel' };
    const mode = channel.mode as 'manual' | 'semi' | 'auto';

    // Auto-fire only acts on channels explicitly set to auto.
    if (opts.trigger === 'auto' && mode !== 'auto') return { ok: false, reason: 'channel-not-auto' };

    const conversation = await db.conversation.upsert({
      where: { prospectId_channelId: { prospectId: enr.prospectId, channelId: channel.id } },
      create: { projectId: enr.campaign.projectId, prospectId: enr.prospectId, channelId: channel.id },
      update: { lastAt: new Date() }
    });
    const handle =
      kind === 'email' ? enr.prospect.email : kind === 'linkedin' ? enr.prospect.linkedinUrl : enr.prospect.xHandle;

    // Compliance: a per-enrollment one-click unsubscribe link, plus the optional visible footer.
    const unsubUrl = kind === 'email' ? `${trackingBase(enr.campaign)}/u/${enr.id}` : '';
    let emailBody = bodyR.text;
    if (kind === 'email' && enr.campaign.unsubMessage) {
      emailBody = `${emailBody}\n\n${enr.campaign.unsubMessage}\nUnsubscribe: ${unsubUrl}`;
    }
    const fullBody = subjR.text ? `${subjR.text}\n\n${emailBody}` : emailBody;

    if (kind === 'email' && opts.trigger === 'auto') {
      // Volume path: send through a rotated mailbox with open/click tracking.
      // Create the message first so its id can seed the tracking pixel + links.
      const msg = await db.message.create({
        data: { conversationId: conversation.id, channelId: channel.id, direction: 'out', body: fullBody, status: 'queued', draftMetaJson: meta() }
      });
      const html = buildTrackedHtml(emailBody, {
        messageId: msg.id,
        base: trackingBase(enr.campaign),
        trackOpens: enr.campaign.trackOpens,
        trackClicks: enr.campaign.trackClicks
      });
      const r = await sendProjectEmail(enr.campaign.projectId, { to: handle || '', subject: subjR.text, body: emailBody, html, unsubscribeUrl: unsubUrl });
      if (!r.ok) {
        await db.message.update({ where: { id: msg.id }, data: { status: 'failed' } });
        return { ok: false, reason: r.reason === 'no-capacity' ? 'no-capacity' : 'not-sent', note: r.detail };
      }
      await db.message.update({ where: { id: msg.id }, data: { status: 'sent', sentAt: new Date(), draftMetaJson: meta({ mailbox: r.mailbox }) } });
      status = 'sent';
      note = `via ${r.mailbox}`;
      void emitEvent(enr.campaign.projectId, 'sent', {
        campaignId: enr.campaignId, enrollmentId: enr.id, step: step.order, version: version.label, mailbox: r.mailbox,
        prospect: { id: enr.prospect.id, email: enr.prospect.email, name: enr.prospect.name, company: enr.prospect.company }
      });
    } else {
      const result = await getAdapter(kind).send(
        { to: { name: enr.prospect.name, handle: handle || '' }, body: emailBody, subject: subjR.text },
        mode,
        { projectId: enr.campaign.projectId }
      );
      status = result.status;
      openUrl = result.openUrl;
      note = result.note;
      const sent = result.status === 'sent';
      if (opts.trigger === 'auto' && !sent) return { ok: false, reason: 'not-sent', note };
      await db.message.create({
        data: {
          conversationId: conversation.id, channelId: channel.id, direction: 'out', body: fullBody,
          status: sent ? 'sent' : 'draft', sentAt: sent ? new Date() : null, draftMetaJson: meta({ openUrl })
        }
      });
    }
  } else {
    // call / sms / manual task → cannot be auto-performed.
    if (opts.trigger === 'auto') return { ok: false, reason: 'manual-task' };
    await db.note.create({
      data: {
        prospectId: enr.prospectId,
        source: 'campaign',
        body: `[${enr.campaign.name} · step ${step.order} · ${step.channel}] ${bodyR.text}`
      }
    });
  }

  // Record + advance.
  await db.campaignStepVersion.update({ where: { id: version.id }, data: { sent: { increment: 1 } } });
  await db.campaignSend.create({
    data: {
      campaignId: enr.campaignId,
      enrollmentId: enr.id,
      versionId: version.id,
      channelKind: step.channel,
      trigger: opts.trigger
    }
  });
  await advanceAfterSend(enrollmentId);

  if (['new', 'researching'].includes(enr.prospect.stage)) {
    await db.prospect.update({ where: { id: enr.prospectId }, data: { stage: 'contacted' } });
  }

  return { ok: true, status, openUrl, note };
}
