import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tick } from '$lib/scheduler';

// Manual trigger for the auto-fire scheduler (useful for testing without waiting 60s).
export const POST: RequestHandler = async () => {
  const report = await tick();
  return json(report);
};

// Convenience GET so it can be poked from a browser / curl during setup.
export const GET: RequestHandler = async () => {
  const report = await tick();
  return json(report);
};
