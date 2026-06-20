import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { authProject, json, unauthorized } from '$lib/apiAuth';
import { campaignStats } from '$lib/campaigns/engine';

// GET /api/v1/campaigns — list this project's campaigns with rolled-up stats.
export const GET: RequestHandler = async ({ request }) => {
  const projectId = await authProject(request);
  if (!projectId) return unauthorized();
  const campaigns = await db.campaign.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  const out = await Promise.all(
    campaigns.map(async (c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      stats: await campaignStats(c.id)
    }))
  );
  return json({ count: out.length, campaigns: out });
};
