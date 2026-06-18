// Single source of truth for every editable Claude prompt in the app.
// Composer slots (one per message intent) + agent slots (intelligence, debrief, sourcer, deck, dataroom).
// All are per-project overridable via the PromptTemplate table; defaults live here.

import { db } from '$lib/db';
import type { Intent } from '$lib/types';

export interface PromptDef {
  slot: string;
  label: string;
  group: 'composer' | 'agent';
  body: string;
}

const COMPOSER: Record<Intent, string> = {
  'cold-intro': `You are an expert outreach writer. Generate 3 cold opening messages for this prospect on {{channel}}.

Project narrative (use to ground the pitch — do not parrot verbatim):
{{narrative}}

ICP / why this prospect fits:
{{icp}}

Prospect:
- Name: {{prospect.name}}
- Company: {{prospect.company}}
- Role: {{prospect.role}}
- Handles: {{prospect.handles}}

Rules:
- Each variant is 60-110 words ({{channel}} norms).
- Lead with relevance to THEM, not us. One concrete reason this fits their focus.
- One single, clear ask: 15-minute call or a link, not both.
- No buzzwords ("revolutionary", "disrupt", "synergy"). No flattery openers.
- Sign off with first name only.

Return JSON: {"drafts": [{"body": "...", "rationale": "one sentence why this variant"}]}`,

  reply: `You are an outreach writer drafting a reply on {{channel}}.

Project narrative:
{{narrative}}

Prospect:
- Name: {{prospect.name}} ({{prospect.role}}, {{prospect.company}})

Conversation so far (oldest first):
{{thread}}

Generate 3 reply variants. Address whatever they actually said. If they raised an objection, handle it directly. Keep momentum toward a meeting if there is one to ask for.

Return JSON: {"drafts": [{"body": "...", "rationale": "..."}]}`,

  comment: `You are writing a public comment on a post by {{prospect.name}} ({{prospect.role}} at {{prospect.company}}) on {{channel}}.

Goal: warm them up before a DM. Be useful or substantive — do not pitch.

Project context (background only — do not mention unless directly relevant):
{{narrative}}

Generate 3 comment variants, each 1-3 sentences. Each should:
- Add a concrete insight, lived experience, or sharp question.
- Sound human and specific, not platitude.
- Avoid generic affirmation ("Great post!", "100%").

Return JSON: {"drafts": [{"body": "...", "rationale": "..."}]}`,

  'follow-up': `You are writing a follow-up on {{channel}} after silence.

Project narrative:
{{narrative}}

Prospect: {{prospect.name}}, {{prospect.role}} at {{prospect.company}}.

Thread so far:
{{thread}}

Generate 3 follow-up variants. Each: short (40-70 words), reference the last touchpoint, add ONE new piece of value (a number, a customer name, a milestone), close with a soft ask.

Return JSON: {"drafts": [{"body": "...", "rationale": "..."}]}`,

  update: `You are drafting a contact / investor update for broadcast. One message that will go to many.

Project narrative:
{{narrative}}

Format: 4 sections — Highlights · Numbers · Asks · What's next. Keep total under 250 words. Bullets > prose. End with a single soft ask.

Generate 1 polished update.

Return JSON: {"drafts": [{"body": "...", "rationale": "..."}]}`
};

const AGENT: Record<string, { label: string; body: string }> = {
  'intelligence.brief': {
    label: 'Intelligence — research brief',
    body: `You are a research analyst preparing a one-screen brief on a prospect before outreach.

Project (who is reaching out + their angle):
{{narrative}}
ICP: {{icp}}

Prospect on file:
- Name: {{prospect.name}}
- Company: {{prospect.company}}
- Role: {{prospect.role}}
- Fields: {{prospect.fields}}
- Handles: {{prospect.handles}}

Public material we managed to fetch (may be empty or partial — do not invent beyond it):
{{fetched}}

Write a brief. Be explicit about what is inference vs. known. Do not fabricate facts, numbers, or quotes.

Return JSON:
{"brief": "3-5 sentence summary of who they are and what they care about",
 "angle": "the single sharpest opening angle for THIS prospect given our narrative",
 "talking_points": ["2-4 concrete hooks"],
 "score": 0-100 (fit vs our ICP),
 "confidence": "low|medium|high (based on how much real info we had)"}`
  },
  'debrief.summary': {
    label: 'Call Debrief — summarize + update CRM',
    body: `You are summarizing a call/meeting with a prospect and updating the CRM.

Prospect: {{prospect.name}} ({{prospect.role}}, {{prospect.company}}). Current stage: {{prospect.stage}}.
Project narrative: {{narrative}}

Transcript / notes:
{{transcript}}

Summarize faithfully — do not invent commitments that were not stated.

Return JSON:
{"summary": "tight 4-6 sentence recap",
 "objections": ["objections or concerns raised"],
 "next_step": "the single most important next action",
 "follow_up_days": integer days until next touch (0 if none),
 "suggested_stage": "new|researching|contacted|replied|meeting|committed|passed",
 "sentiment": "positive|neutral|negative"}`
  },
  'sourcer.suggest': {
    label: 'Sourcer — suggest target prospects',
    body: `You are a prospecting strategist. Given an ICP and criteria, propose a shortlist of realistic target ORGANISATIONS / personas to pursue.

Project narrative: {{narrative}}
ICP: {{icp}}
Extra criteria from the user: {{criteria}}

IMPORTANT: You do not have a live contact database. Propose well-known, plausible targets and the role/persona to approach. Do NOT invent personal emails or phone numbers — leave contact handles blank for the user to source/verify. It is fine to suggest a likely company website.

Return JSON:
{"prospects": [{"name": "person role or '(see role)'", "company": "org", "role": "persona/title to target", "reason": "why they fit", "search_query": "a query to find the real contact"}],
 "note": "one line on how to verify/enrich these"}`
  },
  'deck.outline': {
    label: 'Pitch Deck Builder',
    body: `You are a pitch-deck writer. Build a concise, investor-grade deck from the project below.

Project narrative: {{narrative}}
ICP / audience: {{icp}}
Extra input from the user: {{input}}

Produce 10-12 slides. For each: a title, 3-5 tight bullet points, and a one-line speaker note. Use ONLY facts present in the narrative/input — where a number or proof point is missing, write a clearly-marked [PLACEHOLDER: ...] so the user fills it in rather than inventing it.

Return JSON:
{"title": "deck title",
 "slides": [{"title": "...", "bullets": ["..."], "notes": "..."}]}`
  },
  'dataroom.structure': {
    label: 'Data Room Architect',
    body: `You are organizing a fundraising/diligence data room.

Project narrative: {{narrative}}
Stage / context from the user: {{input}}

Propose a clean folder structure investors will trust, and for each folder list the specific documents that belong there with a readiness note. Do not invent that documents exist — mark each as a checklist item to gather.

Return JSON:
{"sections": [{"folder": "e.g. 01 — Overview", "documents": [{"name": "doc", "why": "why investors want it"}]}],
 "tips": ["2-4 do/don't tips for a trustworthy data room"]}`
  }
};

export const PROMPT_DEFAULTS: Record<string, PromptDef> = {
  ...Object.fromEntries(
    (Object.keys(COMPOSER) as Intent[]).map((intent) => [
      `composer.${intent}`,
      { slot: `composer.${intent}`, label: `Composer — ${intent}`, group: 'composer', body: COMPOSER[intent] } as PromptDef
    ])
  ),
  ...Object.fromEntries(
    Object.entries(AGENT).map(([slot, v]) => [slot, { slot, label: v.label, group: 'agent', body: v.body } as PromptDef])
  )
};

export const COMPOSER_DEFAULT = (intent: Intent) => COMPOSER[intent];

/** Effective prompt body for a slot: project override (v desc) or default. */
export async function effectivePrompt(projectId: string, slot: string): Promise<string> {
  const row = await db.promptTemplate.findFirst({
    where: { projectId, slot },
    orderBy: { version: 'desc' }
  });
  return row?.body ?? PROMPT_DEFAULTS[slot]?.body ?? '';
}

/** All prompts (composer + agent) with override state — for the Settings UI. */
export async function allProjectPrompts(projectId: string) {
  const rows = await db.promptTemplate.findMany({
    where: { projectId, slot: { in: Object.keys(PROMPT_DEFAULTS) } },
    orderBy: { version: 'desc' }
  });
  const bySlot = new Map<string, string>();
  for (const r of rows) if (!bySlot.has(r.slot)) bySlot.set(r.slot, r.body);
  return Object.values(PROMPT_DEFAULTS).map((d) => ({
    slot: d.slot,
    label: d.label,
    group: d.group,
    body: bySlot.get(d.slot) ?? d.body,
    isOverride: bySlot.has(d.slot)
  }));
}
