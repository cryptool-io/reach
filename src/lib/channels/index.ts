import type { ChannelKind } from '$lib/types';
import { emailAdapter } from './email';
import { linkedinAdapter } from './linkedin';
import { stubAdapter } from './stub';

export interface SendInput {
  to: { name: string; handle: string };
  body: string;
  subject?: string;
}
export interface SendResult {
  status: 'queued' | 'sent' | 'drafted';
  externalId?: string;
  openUrl?: string; // for manual-mode: where the human should go to send
  note?: string;
}
export interface InboxMessage {
  externalId: string;
  fromHandle: string;
  toHandle: string;
  body: string;
  at: Date;
}

export interface SendContext {
  projectId: string;
}

export interface ChannelAdapter {
  kind: ChannelKind;
  send(input: SendInput, mode: 'manual' | 'semi' | 'auto', ctx?: SendContext): Promise<SendResult>;
  fetchInbox?(since?: Date): Promise<InboxMessage[]>;
}

const REGISTRY: Record<ChannelKind, ChannelAdapter> = {
  email: emailAdapter,
  linkedin: linkedinAdapter,
  x: stubAdapter('x'),
  telegram: stubAdapter('telegram'),
  discord: stubAdapter('discord')
};

export function getAdapter(kind: ChannelKind): ChannelAdapter {
  return REGISTRY[kind];
}
