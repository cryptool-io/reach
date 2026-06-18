// Merge-tag / snippet rendering for campaign templates (Woodpecker-style).
// Tags: {{first_name}} {{last_name}} {{name}} {{company}} {{role}} {{email}}
//        {{linkedin}} {{x}} and any custom field via {{custom.key}} or bare {{key}}.

import type { Prospect } from '@prisma/client';

export interface RenderResult {
  text: string;
  /** snippet keys that resolved to empty — used for empty-field detection */
  missing: string[];
}

export function snippetContext(p: Prospect): Record<string, string> {
  const [first, ...rest] = (p.name ?? '').trim().split(/\s+/);
  let custom: Record<string, unknown> = {};
  try {
    custom = JSON.parse(p.customJson || '{}');
  } catch {
    custom = {};
  }
  const base: Record<string, string> = {
    name: p.name ?? '',
    first_name: first ?? '',
    last_name: rest.join(' '),
    company: p.company ?? '',
    role: p.role ?? '',
    email: p.email ?? '',
    linkedin: p.linkedinUrl ?? '',
    x: p.xHandle ?? '',
    telegram: p.telegram ?? '',
    discord: p.discord ?? ''
  };
  for (const [k, v] of Object.entries(custom)) {
    base[k] = v == null ? '' : String(v);
    base[`custom.${k}`] = base[k];
  }
  return base;
}

// Supports a fallback / default value: {{first_name|there}} → "there" when first_name is empty.
const TAG_RE = /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export function renderTemplate(template: string, p: Prospect): RenderResult {
  const ctx = snippetContext(p);
  const missing = new Set<string>();
  const text = template.replace(TAG_RE, (_, key: string, fallback?: string) => {
    const val = ctx[key];
    if (val === undefined || val === '') {
      if (fallback !== undefined && fallback !== '') return fallback; // graceful default
      missing.add(key);
      return `{{${key}}}`; // no fallback → leave visible + flag (blocks send if empty-field detection on)
    }
    return val;
  });
  return { text, missing: [...missing] };
}

/** All snippet keys referenced in a template. */
export function usedSnippets(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(TAG_RE)) out.add(m[1]);
  return [...out];
}
