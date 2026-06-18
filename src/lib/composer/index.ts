import { complete } from '$lib/anthropic';
import { db } from '$lib/db';
import type { Intent, ChannelKind } from '$lib/types';
import { CHANNEL_LABEL, INTENT_LABEL } from '$lib/types';
import { effectivePrompt } from '$lib/prompts';

export interface ComposeInput {
  projectId: string;
  prospectId: string;
  channelKind: ChannelKind;
  intent: Intent;
  threadContext?: string; // last few messages for reply / objection-handler
}

export interface Draft {
  body: string;
  rationale: string;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{([\w.]+)\}\}/g, (_, k) => vars[k] ?? '');
}

export async function compose(input: ComposeInput): Promise<Draft[]> {
  const [project, prospect, tpl] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { id: input.projectId } }),
    db.prospect.findUniqueOrThrow({ where: { id: input.prospectId } }),
    effectivePrompt(input.projectId, `composer.${input.intent}`)
  ]);

  const handles = [
    prospect.email && `email:${prospect.email}`,
    prospect.linkedinUrl && `linkedin:${prospect.linkedinUrl}`,
    prospect.xHandle && `x:${prospect.xHandle}`,
    prospect.telegram && `telegram:${prospect.telegram}`,
    prospect.discord && `discord:${prospect.discord}`
  ]
    .filter(Boolean)
    .join(', ');

  const user = fill(tpl, {
    channel: CHANNEL_LABEL[input.channelKind],
    intent: INTENT_LABEL[input.intent],
    narrative: project.narrativeMd || '(no narrative set)',
    icp: project.icpMd || '(no ICP set)',
    'prospect.name': prospect.name,
    'prospect.company': prospect.company || '(unknown)',
    'prospect.role': prospect.role || '(unknown)',
    'prospect.handles': handles || '(no handles on file)',
    thread: input.threadContext ?? '(no prior messages)'
  });

  const out = await complete({
    model: 'smart',
    system:
      'You are Reach, a Claude-powered outreach composer. Return ONLY valid JSON matching the requested schema, no prose around it.',
    user,
    maxTokens: 1500
  });

  return parseDrafts(out);
}

function parseDrafts(raw: string): Draft[] {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return [{ body: trimmed, rationale: 'raw output (no JSON envelope found)' }];
  }
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    if (Array.isArray(parsed.drafts)) {
      const valid = parsed.drafts.filter(
        (d: unknown): d is { body: string; rationale?: string } =>
          !!d && typeof (d as { body: unknown }).body === 'string'
      );
      return valid.map((d: { body: string; rationale?: string }) => ({
        body: d.body.trim(),
        rationale: (d.rationale ?? '').trim()
      }));
    }
  } catch {
    // fall through
  }
  return [{ body: trimmed, rationale: 'raw output (could not parse JSON)' }];
}
