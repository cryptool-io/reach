export const CHANNEL_KINDS = ['email', 'linkedin', 'x', 'telegram', 'discord'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const MODES = ['manual', 'semi', 'auto'] as const;
export type Mode = (typeof MODES)[number];

export const STAGES = [
  'new',
  'researching',
  'contacted',
  'replied',
  'meeting',
  'committed',
  'passed'
] as const;
export type Stage = (typeof STAGES)[number];

export const INTENTS = [
  'cold-intro',
  'reply',
  'comment',
  'follow-up',
  'update'
] as const;
export type Intent = (typeof INTENTS)[number];

export const CHANNEL_LABEL: Record<ChannelKind, string> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  x: 'X / Twitter',
  telegram: 'Telegram',
  discord: 'Discord'
};

export const STAGE_LABEL: Record<Stage, string> = {
  new: 'New',
  researching: 'Researching',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  committed: 'Committed',
  passed: 'Passed'
};

export const INTENT_LABEL: Record<Intent, string> = {
  'cold-intro': 'Cold intro',
  reply: 'Reply',
  comment: 'Post comment',
  'follow-up': 'Follow-up',
  update: 'Update / broadcast'
};
