// Campaign engine: enrollment, scheduling, step advancement.
// v0 = manual mode: the engine computes WHAT is due and WHEN; a human sends from the Queue.
// When a channel mode flips to auto (post-wiring), the same nextActionAt drives the sender.

import { db } from '$lib/db';
import { emitEvent, type WebhookEvent } from '$lib/webhooks';

// Step-gating logic lives in a pure, DB-free module (unit-testable). Re-exported here so the rest
// of the engine's consumers keep importing from one place.
export { meetsCondition, evaluateStepGate, isWaitable, WAIT_RECHECK_MS } from './gating';

const DAY_MS = 24 * 60 * 60 * 1000;

type StepLite = { id: string; order: number; delayDays: number; condition: string };

/** Enroll prospects, skipping duplicates if the campaign asks for it. */
export async function enrollProspects(
  campaignId: string,
  prospectIds: string[]
): Promise<{ added: number; skipped: number }> {
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { steps: { orderBy: { order: 'asc' }, take: 1 } }
  });
  const firstStep = campaign.steps[0];

  let added = 0;
  let skipped = 0;
  for (const prospectId of prospectIds) {
    const exists = await db.campaignEnrollment.findUnique({
      where: { campaignId_prospectId: { campaignId, prospectId } }
    });
    if (exists) {
      skipped++;
      continue;
    }
    const nextActionAt = firstStep ? new Date(Date.now() + firstStep.delayDays * DAY_MS) : null;
    await db.campaignEnrollment.create({
      data: {
        campaignId,
        prospectId,
        currentStep: firstStep ? firstStep.order : 0, // order of the next step to send
        status: 'active',
        nextActionAt
      }
    });
    added++;
  }
  return { added, skipped };
}

/** Bulk-enroll many prospects efficiently (skips already-enrolled), chunked. */
export async function enrollMany(campaignId: string, prospectIds: string[]): Promise<number> {
  if (prospectIds.length === 0) return 0;
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { steps: { orderBy: { order: 'asc' }, take: 1 } }
  });
  const firstStep = campaign.steps[0];
  const nextActionAt = firstStep ? new Date(Date.now() + firstStep.delayDays * DAY_MS) : null;
  const currentStep = firstStep ? firstStep.order : 0;

  const existing = new Set(
    (await db.campaignEnrollment.findMany({ where: { campaignId }, select: { prospectId: true } })).map((e) => e.prospectId)
  );
  const fresh = prospectIds.filter((id) => !existing.has(id));

  const CHUNK = 200;
  let added = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    await db.campaignEnrollment.createMany({
      data: fresh.slice(i, i + CHUNK).map((prospectId) => ({
        campaignId,
        prospectId,
        currentStep,
        status: 'active',
        nextActionAt
      }))
    });
    added += Math.min(CHUNK, fresh.length - i);
  }
  return added;
}

/** Enrollments whose current step is due (manual queue). */
export async function dueEnrollments(campaignId: string) {
  const now = new Date();
  return db.campaignEnrollment.findMany({
    where: {
      campaignId,
      status: 'active',
      OR: [{ nextActionAt: null }, { nextActionAt: { lte: now } }]
    },
    include: { prospect: true },
    orderBy: { nextActionAt: 'asc' }
  });
}

/**
 * Advance an enrollment after its current step was sent.
 * Picks the next step (respecting simple conditions) and schedules it,
 * or marks the enrollment completed when the sequence ends.
 */
export async function advanceAfterSend(enrollmentId: string) {
  const enr = await db.campaignEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { campaign: { include: { steps: { orderBy: { order: 'asc' } } } } }
  });
  const steps = enr.campaign.steps as StepLite[];
  const nextStep = steps.find((s) => s.order > enr.currentStep);

  if (!nextStep) {
    await db.campaignEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'completed', nextActionAt: null, waitingSince: null, lastEventAt: new Date() }
    });
    return;
  }
  await db.campaignEnrollment.update({
    where: { id: enrollmentId },
    data: {
      currentStep: nextStep.order,
      nextActionAt: new Date(Date.now() + nextStep.delayDays * DAY_MS),
      waitingSince: null, // leaving this step → reset the wait clock for the next one
      lastEventAt: new Date()
    }
  });
}

/** Record a reply / interest. Honors stop-on-reply. */
export async function markEvent(
  enrollmentId: string,
  event: 'replied' | 'bounced' | 'opted-out' | 'paused' | 'active',
  interest?: string
) {
  const enr = await db.campaignEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { campaign: true }
  });

  const data: Record<string, unknown> = { lastEventAt: new Date() };
  if (interest) data.interest = interest;

  if (event === 'replied') {
    data.status = enr.campaign.stopOnReply ? 'replied' : 'active';
    if (!interest) data.interest = 'interested';
    if (enr.campaign.stopOnReply) data.nextActionAt = null;
  } else if (event === 'bounced') {
    data.status = 'bounced';
    data.interest = 'bounced';
    data.nextActionAt = null;
  } else if (event === 'opted-out') {
    data.status = 'opted-out';
    data.nextActionAt = null;
  } else if (event === 'paused') {
    data.status = 'paused';
  } else if (event === 'active') {
    data.status = 'active';
  }

  await db.campaignEnrollment.update({ where: { id: enrollmentId }, data });

  const evMap: Record<string, WebhookEvent | undefined> = { replied: 'replied', bounced: 'bounced', 'opted-out': 'unsubscribed' };
  const ev = evMap[event];
  if (ev)
    void emitEvent(enr.campaign.projectId, ev, {
      campaignId: enr.campaignId, enrollmentId: enr.id, prospectId: enr.prospectId, interest: data.interest ?? enr.interest
    });
}

/** Pick the A/B version for a step (round-robin by current sent counts). */
export function pickVersion<T extends { sent: number }>(versions: T[]): T | undefined {
  if (versions.length === 0) return undefined;
  return [...versions].sort((a, b) => a.sent - b.sent)[0];
}

/** Roll up campaign-level stats from versions + enrollments. */
export async function campaignStats(campaignId: string) {
  const [versions, enrollments] = await Promise.all([
    db.campaignStepVersion.findMany({ where: { step: { campaignId } } }),
    db.campaignEnrollment.findMany({ where: { campaignId } })
  ]);
  const sum = (k: 'sent' | 'opened' | 'clicked' | 'replied') =>
    versions.reduce((acc, v) => acc + v[k], 0);

  const byStatus = (s: string) => enrollments.filter((e) => e.status === s).length;
  const byInterest = (i: string) => enrollments.filter((e) => e.interest === i).length;
  // Active enrollments currently parked on a wait-step (waiting for an open/click).
  const waiting = enrollments.filter((e) => e.status === 'active' && e.waitingSince != null).length;

  const sent = sum('sent');
  return {
    enrolled: enrollments.length,
    active: byStatus('active'),
    waiting,
    sent,
    opened: sum('opened'),
    clicked: sum('clicked'),
    replied: sum('replied'),
    bounced: byStatus('bounced'),
    optedOut: byStatus('opted-out'),
    completed: byStatus('completed'),
    interested: byInterest('interested'),
    maybe: byInterest('maybe'),
    notInterested: byInterest('not-interested'),
    openRate: sent ? Math.round((sum('opened') / sent) * 100) : 0,
    replyRate: sent ? Math.round((sum('replied') / sent) * 100) : 0
  };
}
