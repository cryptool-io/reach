// Outbound webhooks: fire-and-forget POSTs of campaign events to a project's registered URLs.
// Callers should NOT await (use `void emitEvent(...)`) — this never throws and never blocks a send.

import { db } from '$lib/db';
import crypto from 'node:crypto';

export type WebhookEvent = 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'unsubscribed';
export const WEBHOOK_EVENTS: WebhookEvent[] = ['sent', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed'];

export async function emitEvent(projectId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const hooks = await db.webhook.findMany({ where: { projectId, active: true } });
    if (!hooks.length) return;
    const payload = JSON.stringify({ event, at: new Date().toISOString(), projectId, data });
    await Promise.all(
      hooks
        .filter((h) => h.events === 'all' || h.events.split(',').map((s) => s.trim()).includes(event))
        .map(async (h) => {
          const headers: Record<string, string> = {
            'content-type': 'application/json',
            'user-agent': 'Reach-Webhooks/1',
            'x-reach-event': event
          };
          if (h.secret) {
            headers['x-reach-signature'] = 'sha256=' + crypto.createHmac('sha256', h.secret).update(payload).digest('hex');
          }
          try {
            const r = await fetch(h.url, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(8000) });
            await db.webhook
              .update({ where: { id: h.id }, data: { lastStatus: String(r.status), lastFiredAt: new Date() } })
              .catch(() => {});
          } catch (e) {
            await db.webhook
              .update({ where: { id: h.id }, data: { lastStatus: 'error: ' + (e as Error).message.slice(0, 60), lastFiredAt: new Date() } })
              .catch(() => {});
          }
        })
    );
  } catch {
    /* webhooks must never break the caller */
  }
}
