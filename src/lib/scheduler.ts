// In-process auto-fire scheduler. No external queue/Redis for v0 — a 60s interval timer.
// For production scale, swap tick() onto BullMQ + Redis; the logic stays identical.

import { db } from '$lib/db';
import { dispatchStep, stepChannelKind } from '$lib/campaigns/dispatch';
import { syncReplies } from '$lib/channels/email/sync';

function zonedNow(tz: string): { dow: number; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let h = parseInt(get('hour'), 10);
    if (h === 24) h = 0;
    const m = parseInt(get('minute'), 10);
    return { dow: map[get('weekday')] ?? 0, minutes: h * 60 + m };
  } catch {
    const d = new Date();
    return { dow: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
}

function parseHm(s: string): number {
  const [h, m] = (s || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function withinWindow(c: { timezone: string; sendDaysJson: string; sendFrom: string; sendTo: string }): boolean {
  const { dow, minutes } = zonedNow(c.timezone);
  let days: number[] = [];
  try {
    days = JSON.parse(c.sendDaysJson);
  } catch {
    days = [1, 2, 3, 4, 5];
  }
  if (!days.includes(dow)) return false;
  return minutes >= parseHm(c.sendFrom) && minutes <= parseHm(c.sendTo);
}

let running = false;

// Randomized send interval: when a campaign sets a min/max gap, we pace ONE send per slot
// (human-like) instead of draining a batch. The next-allowed timestamp per campaign is held in
// memory; on a cold start it's reseeded from the last recorded send so spacing survives restarts.
const nextSendAllowed = new Map<string, number>();

function intervalGapMs(c: { intervalMinMinutes: number; intervalMaxMinutes: number }): number {
  const min = Math.max(0, c.intervalMinMinutes || 0);
  const max = Math.max(min, c.intervalMaxMinutes || min);
  const minutes = max <= 0 ? 0 : min + Math.random() * (max - min);
  return minutes * 60_000;
}

export interface TickReport {
  scanned: number;
  sent: number;
  waited: number;
  repliesMatched: number;
  details: string[];
}

export async function tick(): Promise<TickReport> {
  if (running) return { scanned: 0, sent: 0, waited: 0, repliesMatched: 0, details: ['tick already in progress'] };
  running = true;
  const details: string[] = [];
  let sent = 0;
  let waited = 0;
  let scanned = 0;
  let repliesMatched = 0;
  try {
    // 1) pull replies first so stop-on-reply applies before we send anything
    try {
      const r = await syncReplies();
      repliesMatched = r.matched;
      if (r.matched) details.push(`replies: ${r.details.join(', ')}`);
    } catch (e) {
      details.push(`reply-sync error: ${(e as Error).message}`);
    }
    const campaigns = await db.campaign.findMany({ where: { status: 'running' }, include: { steps: true } });
    for (const c of campaigns) {
      scanned++;
      if (!withinWindow(c)) {
        details.push(`${c.name}: outside send window`);
        continue;
      }
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const sentTodayCount = await db.campaignSend.count({ where: { campaignId: c.id, at: { gte: startOfDay } } });
      if (sentTodayCount >= c.dailyLimit) {
        details.push(`${c.name}: daily limit (${c.dailyLimit}) reached`);
        continue;
      }

      // Randomized send interval: when configured, pace one send per [min,max]-minute slot.
      const intervalOn = (c.intervalMinMinutes || 0) > 0 || (c.intervalMaxMinutes || 0) > 0;
      if (intervalOn) {
        let allowedAt = nextSendAllowed.get(c.id);
        if (allowedAt === undefined) {
          const last = await db.campaignSend.findFirst({
            where: { campaignId: c.id },
            orderBy: { at: 'desc' },
            select: { at: true }
          });
          allowedAt = last ? last.at.getTime() + intervalGapMs(c) : 0;
          nextSendAllowed.set(c.id, allowedAt);
        }
        if (Date.now() < allowedAt) {
          details.push(`${c.name}: interval throttle (paced)`);
          continue;
        }
      }

      // Which channels are auto-enabled? Email is sendable when its channel is auto + the project has mailboxes.
      const channels = await db.channel.findMany({ where: { projectId: c.projectId } });
      const mailboxCount = await db.mailbox.count({ where: { projectId: c.projectId, status: 'active' } });
      const autoKinds = new Set<string>();
      for (const ch of channels) {
        if (ch.mode !== 'auto') continue;
        if (ch.kind === 'email') {
          if (mailboxCount > 0) autoKinds.add('email');
        } else if (ch.status === 'connected') {
          autoKinds.add(ch.kind);
        }
      }
      if (autoKinds.size === 0) {
        details.push(`${c.name}: no auto channel (set a channel to Auto + add a mailbox)`);
        continue;
      }

      // Send a BATCH this tick: drain due enrollments up to the campaign's remaining daily budget,
      // capped per tick. Mailbox rotation + per-mailbox caps bound the real daily volume.
      const PER_TICK = 15;
      let budget = Math.min(c.dailyLimit - sentTodayCount, intervalOn ? 1 : PER_TICK);
      const due = await db.campaignEnrollment.findMany({
        where: { campaignId: c.id, status: 'active', OR: [{ nextActionAt: null }, { nextActionAt: { lte: new Date() } }] },
        include: { prospect: true },
        orderBy: { nextActionAt: 'asc' },
        take: budget * 3 + 20
      });

      let campaignSent = 0;
      let campaignWaited = 0;
      let noCapacity = false;
      for (const e of due) {
        if (budget <= 0) break;
        const step = c.steps.find((s) => s.order === e.currentStep);
        if (!step) continue;
        const k = stepChannelKind(step.channel);
        if (!k || !autoKinds.has(k)) continue; // manual/non-auto steps wait for the human Queue
        const r = await dispatchStep(e.id, { trigger: 'auto' });
        if (r.ok) {
          campaignSent++;
          budget--;
        } else if (r.reason === 'condition-wait') {
          campaignWaited++; // parked on a wait-step; doesn't consume the daily budget
        } else if (r.reason === 'no-capacity') {
          noCapacity = true;
          break; // all mailboxes at their daily cap
        }
      }
      sent += campaignSent;
      waited += campaignWaited;
      // Open the next interval slot only after an actual send.
      if (intervalOn && campaignSent > 0) nextSendAllowed.set(c.id, Date.now() + intervalGapMs(c));
      details.push(
        `${c.name}: sent ${campaignSent}${campaignWaited ? `, waiting ${campaignWaited}` : ''}${noCapacity ? ' (mailbox capacity reached)' : ''}`
      );
    }
  } finally {
    running = false;
  }
  return { scanned, sent, waited, repliesMatched, details };
}

declare global {
  // eslint-disable-next-line no-var
  var __reachScheduler: ReturnType<typeof setInterval> | undefined;
}

export function startScheduler() {
  if (globalThis.__reachScheduler) return;
  globalThis.__reachScheduler = setInterval(() => {
    tick().catch((e) => console.error('[scheduler] tick error', e));
  }, 60_000);
  setTimeout(() => tick().catch(() => {}), 5_000); // first run shortly after boot
  console.log('[scheduler] auto-fire started (60s interval)');
}
