import type { ChannelAdapter } from '../index';

// v0: manual via Claude-in-Chrome. We hand the human a LinkedIn URL + the drafted body on the clipboard.
// Auto mode needs an approved LinkedIn API path; deferred.
export const linkedinAdapter: ChannelAdapter = {
  kind: 'linkedin',
  async send(input, mode) {
    if (mode === 'manual' || mode === 'semi') {
      const profile = input.to.handle.startsWith('http')
        ? input.to.handle
        : `https://www.linkedin.com/in/${encodeURIComponent(input.to.handle.replace(/^@/, ''))}`;
      return {
        status: 'drafted',
        openUrl: profile,
        note: 'opens LinkedIn profile — paste from clipboard into DM or post-comment'
      };
    }
    return { status: 'drafted', note: 'LinkedIn auto-send not enabled' };
  }
};
