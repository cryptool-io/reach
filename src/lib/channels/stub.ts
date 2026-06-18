import type { ChannelAdapter } from './index';
import type { ChannelKind } from '$lib/types';

export function stubAdapter(kind: ChannelKind): ChannelAdapter {
  return {
    kind,
    async send(input, mode) {
      // Manual mode: park the draft. Auto/semi: still parked until the real adapter is wired.
      return {
        status: 'drafted',
        note: `${kind} send in ${mode} mode — adapter pending wiring`
      };
    }
  };
}
