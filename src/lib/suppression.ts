// Project-wide opt-out / unsubscribe list. Checked at send so an unsubscribe (or a hard bounce)
// stops every campaign in the project, not just the one that triggered it.

import { db } from '$lib/db';

const norm = (e: string) => e.trim().toLowerCase();

export async function isSuppressed(projectId: string, email: string): Promise<boolean> {
  const e = norm(email || '');
  if (!e) return false;
  const hit = await db.suppression.findUnique({ where: { projectId_email: { projectId, email: e } } });
  return !!hit;
}

export async function addSuppression(projectId: string, email: string, reason = 'unsubscribe'): Promise<void> {
  const e = norm(email || '');
  if (!e) return;
  await db.suppression
    .upsert({
      where: { projectId_email: { projectId, email: e } },
      create: { projectId, email: e, reason },
      update: { reason }
    })
    .catch(() => {});
}
