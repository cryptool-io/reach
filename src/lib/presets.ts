// Domain presets. A preset only PRE-FILLS editable per-project settings (custom fields,
// starter cadences, narrative/ICP hints). Nothing here is hardcoded into the engine —
// a client can change all of it afterwards, or start from "Blank".

export type FieldType = 'text' | 'number' | 'url';

export interface FieldDef {
  key: string; // snippet key + customJson key (lowercase, underscores)
  label: string;
  type: FieldType;
}

export interface CadenceDef {
  name: string;
  steps: { day: number; channel: string; intent: string; note?: string }[];
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  narrativeHint: string;
  icpHint: string;
  fields: FieldDef[];
  cadences: CadenceDef[];
}

export const PRESETS: Preset[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Empty workspace. Add your own fields, prompts and cadences.',
    narrativeHint: 'One or two lines on what you do and why someone should care now.',
    icpHint: 'Who you are targeting and why they fit.',
    fields: [],
    cadences: []
  },
  {
    id: 'fundraising',
    label: 'Fundraising',
    description: 'Raise from investors. Investor fields, warm-intro tracking, a cold-to-meeting cadence.',
    narrativeHint: 'What you are building, traction, the round (stage, size, instrument).',
    icpHint: 'Investor profile: fund type, ticket size, stage, geography, thesis fit.',
    fields: [
      { key: 'fund_type', label: 'Fund type', type: 'text' },
      { key: 'ticket_min', label: 'Ticket min', type: 'number' },
      { key: 'ticket_max', label: 'Ticket max', type: 'number' },
      { key: 'stage_focus', label: 'Stage focus', type: 'text' },
      { key: 'geo', label: 'Geography', type: 'text' },
      { key: 'thesis', label: 'Thesis', type: 'text' },
      { key: 'warm_intro_via', label: 'Warm intro via', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' }
    ],
    cadences: [
      {
        name: 'Cold-to-meeting',
        steps: [
          { day: 0, channel: 'linkedin-connect', intent: 'comment', note: 'comment on a recent post' },
          { day: 2, channel: 'linkedin-dm', intent: 'cold-intro' },
          { day: 5, channel: 'email', intent: 'cold-intro' },
          { day: 10, channel: 'email', intent: 'follow-up' }
        ]
      }
    ]
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'B2B outbound. Account fields, a multi-touch outbound sequence.',
    narrativeHint: 'What you sell, the problem it solves, proof (customers, numbers).',
    icpHint: 'Target accounts: company size, industry, role/persona, trigger to buy.',
    fields: [
      { key: 'company_size', label: 'Company size', type: 'number' },
      { key: 'industry', label: 'Industry', type: 'text' },
      { key: 'use_case', label: 'Use case', type: 'text' },
      { key: 'budget', label: 'Budget', type: 'text' },
      { key: 'timeline', label: 'Timeline', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' }
    ],
    cadences: [
      {
        name: 'Outbound sales',
        steps: [
          { day: 0, channel: 'email', intent: 'cold-intro' },
          { day: 3, channel: 'linkedin-connect', intent: 'cold-intro' },
          { day: 6, channel: 'email', intent: 'follow-up' },
          { day: 12, channel: 'call', intent: 'follow-up', note: 'call attempt' }
        ]
      }
    ]
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    description: 'Source candidates. Candidate fields, a respectful outreach sequence.',
    narrativeHint: 'The role, the company, why it is a great move for the right person.',
    icpHint: 'Ideal candidate: seniority, skills, current company, location.',
    fields: [
      { key: 'current_company', label: 'Current company', type: 'text' },
      { key: 'seniority', label: 'Seniority', type: 'text' },
      { key: 'skills', label: 'Skills', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'notice_period', label: 'Notice period', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' }
    ],
    cadences: [
      {
        name: 'Candidate outreach',
        steps: [
          { day: 0, channel: 'linkedin-dm', intent: 'cold-intro' },
          { day: 4, channel: 'email', intent: 'cold-intro' },
          { day: 9, channel: 'linkedin-dm', intent: 'follow-up' }
        ]
      }
    ]
  }
];

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** Parse a project's stored field schema safely. */
export function parseFieldSchema(json: string): FieldDef[] {
  try {
    const arr = JSON.parse(json || '[]');
    if (Array.isArray(arr)) {
      return arr.filter((f) => f && typeof f.key === 'string').map((f) => ({
        key: String(f.key),
        label: String(f.label ?? f.key),
        type: (['text', 'number', 'url'].includes(f.type) ? f.type : 'text') as FieldType
      }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** Normalize a user-entered field key into snippet-safe form. */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
