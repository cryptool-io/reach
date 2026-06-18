import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it in .env or Settings.');
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const MODEL = {
  // Deep reasoning: composer, objection handler, debrief
  smart: 'claude-opus-4-7',
  // Batch / cheap: enrichment, scoring, classification
  fast: 'claude-haiku-4-5-20251001'
} as const;

export async function complete(opts: {
  model?: keyof typeof MODEL;
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const modelId = MODEL[opts.model ?? 'smart'];
  const r = await anthropic().messages.create({
    model: modelId,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }]
  });
  const first = r.content[0];
  if (first && first.type === 'text') return first.text;
  return '';
}
