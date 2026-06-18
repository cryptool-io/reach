import type { PageServerLoad } from './$types';
import { db } from '$lib/db';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.activeProjectId) return { conversations: [], filter: null };
  const filter = url.searchParams.get('channel'); // email | linkedin | x | telegram | discord
  const conversations = await db.conversation.findMany({
    where: {
      projectId: locals.activeProjectId,
      ...(filter ? { channel: { kind: filter } } : {})
    },
    include: {
      prospect: true,
      channel: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 }
    },
    orderBy: { lastAt: 'desc' }
  });
  return { conversations, filter };
};
