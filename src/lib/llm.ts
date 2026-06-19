// Provider-agnostic LLM layer.
// Every supported provider speaks the OpenAI chat-completions API (Gemini via its OpenAI-compat
// endpoint), so a single fetch client serves them all. complete() uses the first provider that has
// an API key set — priority = free/best first — and falls back to the next if one errors or
// rate-limits (free tiers throttle, so fallback matters). No SDK dependency; just fetch.

import { env } from '$env/dynamic/private';

type Tier = 'smart' | 'fast';

interface ProviderDef {
  id: string;
  label: string;
  keyEnv: string; // env var holding the API key
  baseURL: string; // OpenAI-compatible base (no trailing /chat/completions)
  smart: string; // default model for reasoning tasks
  fast: string; // default model for cheap/batch tasks
  modelEnv: string; // env override for the model (applies to both tiers)
  free: boolean;
}

// Priority order: free & strongest first. Whichever has a key set is used; the rest are fallbacks.
// Override the order with LLM_PRIORITY="groq,gemini,…". Override any model with <PROVIDER>_MODEL.
const PROVIDERS: ProviderDef[] = [
  { id: 'gemini', label: 'Google Gemini', keyEnv: 'GEMINI_API_KEY', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', smart: 'gemini-2.5-flash', fast: 'gemini-2.5-flash-lite', modelEnv: 'GEMINI_MODEL', free: true },
  { id: 'groq', label: 'Groq', keyEnv: 'GROQ_API_KEY', baseURL: 'https://api.groq.com/openai/v1', smart: 'llama-3.3-70b-versatile', fast: 'llama-3.1-8b-instant', modelEnv: 'GROQ_MODEL', free: true },
  { id: 'openrouter', label: 'OpenRouter', keyEnv: 'OPENROUTER_API_KEY', baseURL: 'https://openrouter.ai/api/v1', smart: 'deepseek/deepseek-chat-v3-0324:free', fast: 'meta-llama/llama-3.3-70b-instruct:free', modelEnv: 'OPENROUTER_MODEL', free: true },
  { id: 'mistral', label: 'Mistral', keyEnv: 'MISTRAL_API_KEY', baseURL: 'https://api.mistral.ai/v1', smart: 'mistral-large-latest', fast: 'mistral-small-latest', modelEnv: 'MISTRAL_MODEL', free: true },
  { id: 'grok', label: 'Grok (xAI)', keyEnv: 'XAI_API_KEY', baseURL: 'https://api.x.ai/v1', smart: 'grok-2-latest', fast: 'grok-2-latest', modelEnv: 'XAI_MODEL', free: false },
  { id: 'anthropic', label: 'Anthropic Claude', keyEnv: 'ANTHROPIC_API_KEY', baseURL: 'https://api.anthropic.com/v1', smart: 'claude-opus-4-7', fast: 'claude-haiku-4-5-20251001', modelEnv: 'ANTHROPIC_MODEL', free: false }
];

function keyFor(p: ProviderDef): string | undefined {
  const v = env[p.keyEnv];
  return v && v.trim() ? v.trim() : undefined;
}

/** Providers that have an API key set, in priority order (LLM_PRIORITY can reorder). */
export function configuredProviders(): ProviderDef[] {
  const order = (env.LLM_PRIORITY || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = [...PROVIDERS];
  if (order.length) {
    list.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }
  return list.filter(keyFor);
}

/** For the Settings UI: which provider is active, which are fallbacks, what's available. */
export function llmStatus() {
  const active = configuredProviders();
  return {
    enabled: active.length > 0,
    active: active[0]?.label ?? null,
    fallbacks: active.slice(1).map((p) => p.label),
    available: PROVIDERS.map((p) => ({ id: p.id, label: p.label, free: p.free, configured: !!keyFor(p) }))
  };
}

export interface CompleteOpts {
  model?: Tier;
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
}

async function callProvider(p: ProviderDef, opts: CompleteOpts): Promise<string> {
  const key = keyFor(p)!;
  const model = (env[p.modelEnv]?.trim()) || (opts.model === 'fast' ? p.fast : p.smart);
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user });

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? (opts.json ? 0.2 : 0.7)
  };
  if (opts.json) body.response_format = { type: 'json_object' };

  const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  if (p.id === 'openrouter') {
    headers['HTTP-Referer'] = env.PUBLIC_BASE_URL || 'https://reach.cryptool.io';
    headers['X-Title'] = 'Reach';
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let r: Response;
  try {
    r = await fetch(`${p.baseURL}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    throw new Error(`${p.label} ${r.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await r.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (c as { text?: string })?.text ?? '').join('');
  return '';
}

/** Run a completion against the active provider, falling back through the others on failure. */
export async function complete(opts: CompleteOpts): Promise<string> {
  const providers = configuredProviders();
  if (!providers.length) {
    throw new Error('No AI provider configured. Add a free key — GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, or MISTRAL_API_KEY — to the server .env.');
  }
  let lastErr: unknown;
  for (const p of providers) {
    try {
      const out = await callProvider(p, opts);
      if (out && out.trim()) return out;
      lastErr = new Error(`${p.label} returned empty`);
    } catch (e) {
      lastErr = e; // rate-limited / errored → try next configured provider
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('All AI providers failed');
}

// Back-compat shim (older imports referenced MODEL).
export const MODEL = { smart: 'smart', fast: 'fast' } as const;
