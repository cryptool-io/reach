// Shared runner for the Claude-powered agents (intelligence, debrief, sourcer, deck, data room).
// Each agent = an editable prompt slot (see src/lib/prompts.ts) + JSON output parsing.

import { complete } from '$lib/anthropic';
import { effectivePrompt } from '$lib/prompts';

function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, k) => vars[k] ?? '');
}

export function parseJson<T = unknown>(raw: string): T | null {
  const t = raw.trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}

/** Run an agent prompt for a project and parse the JSON result. */
export async function runJsonAgent<T = unknown>(
  projectId: string,
  slot: string,
  vars: Record<string, string>,
  opts: { model?: 'smart' | 'fast'; maxTokens?: number } = {}
): Promise<{ data: T | null; raw: string }> {
  const tpl = await effectivePrompt(projectId, slot);
  const user = fillVars(tpl, vars);
  const raw = await complete({
    model: opts.model ?? 'smart',
    system: 'You are a precise assistant. Return ONLY valid JSON matching the requested schema — no prose, no markdown fences. Never fabricate facts, numbers, names, or contact details beyond what the input provides.',
    user,
    maxTokens: opts.maxTokens ?? 1500
  });
  return { data: parseJson<T>(raw), raw };
}

/**
 * Best-effort fetch of a public page's visible text. Many sites (LinkedIn, etc.) block bots —
 * failures are expected and returned as empty, never thrown.
 */
export async function fetchPublicText(url: string, maxChars = 3000): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ReachBot/0.1)' }
    });
    clearTimeout(t);
    if (!r.ok) return '';
    const html = await r.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}
