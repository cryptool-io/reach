import type { ChannelAdapter } from '../index';
import { loadProjectSmtp } from '../connections';
import { sendSmtp } from './smtp';

// Manual mode → produce a mailto: draft (human reviews + sends).
// Semi / auto mode + a connected SMTP account → send for real through the project's own mailbox.
export const emailAdapter: ChannelAdapter = {
  kind: 'email',
  async send(input, mode, ctx) {
    if ((mode === 'auto' || mode === 'semi') && ctx?.projectId) {
      const creds = await loadProjectSmtp(ctx.projectId);
      if (creds) {
        const r = await sendSmtp(creds, {
          to: input.to.handle,
          subject: input.subject ?? '',
          body: input.body
        });
        return r.ok
          ? { status: 'sent', note: r.detail }
          : { status: 'drafted', note: `SMTP send failed: ${r.detail}` };
      }
    }
    // Manual, or no connected SMTP: hand back a mailto link.
    const subject = encodeURIComponent(input.subject ?? '');
    const body = encodeURIComponent(input.body);
    const openUrl = `mailto:${encodeURIComponent(input.to.handle)}?subject=${subject}&body=${body}`;
    return { status: 'drafted', openUrl, note: 'opens in your default email client' };
  }
};
