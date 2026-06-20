import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { SmtpCreds } from './smtp';

export interface InboundEmail {
  messageId: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  text: string;
  date: Date;
  /** True when the message is an auto-reply / out-of-office (RFC-3834 headers or OOO subject). */
  autoReply: boolean;
  /** When this is a bounce/NDR, the failed recipient address (else null). */
  bounceRecipient: string | null;
}

const OOO_SUBJECT_RE =
  /(out of (the )?office|automatic reply|auto-?reply|on vacation|annual leave|away from my|abwesen|absence du bureau|réponse automatique|en vacances|on holiday|maternity|parental leave)/i;
const BOUNCE_SUBJECT_RE =
  /(undeliverable|delivery status notification|delivery (has )?failed|returned mail|mail delivery (failed|subsystem)|undelivered mail|delivery incomplete|failure notice|message not delivered|address not found)/i;

/** Classify a parsed inbound email as a normal reply, an auto-reply/OOO, or a bounce. */
function classify(
  parsed: import('mailparser').ParsedMail,
  rawSource: Buffer | string,
  fromAddress: string
): { autoReply: boolean; bounceRecipient: string | null } {
  const H = parsed.headers;
  const hstr = (k: string): string => {
    const v = H.get(k) as unknown;
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'value' in v) {
      const val = (v as { value?: unknown }).value;
      return val == null ? '' : String(val);
    }
    return String(v);
  };
  const ct = H.get('content-type') as { value?: string; params?: Record<string, string> } | undefined;
  const ctStr = ct ? `${ct.value ?? ''} ${JSON.stringify(ct.params ?? {})}` : '';
  const subjectLc = (parsed.subject ?? '').toLowerCase();

  const autoSub = hstr('auto-submitted').toLowerCase();
  const precedence = hstr('precedence').toLowerCase();
  const autoReply =
    !!hstr('x-autoreply') || !!hstr('x-autorespond') || !!hstr('x-auto-response-suppress') ||
    autoSub.includes('auto-replied') || autoSub.includes('auto-generated') ||
    ['auto_reply', 'bulk', 'junk'].includes(precedence) ||
    OOO_SUBJECT_RE.test(subjectLc);

  const failedHeader = hstr('x-failed-recipients');
  const isDsn = /multipart\/report/i.test(ctStr) && /delivery-status/i.test(ctStr);
  const looksBounce =
    fromAddress.startsWith('mailer-daemon') || fromAddress.startsWith('postmaster') ||
    isDsn || BOUNCE_SUBJECT_RE.test(subjectLc) || !!failedHeader;

  let bounceRecipient: string | null = null;
  if (looksBounce) {
    let cand = failedHeader ? failedHeader.split(',')[0].trim() : '';
    if (!cand) {
      const raw = typeof rawSource === 'string' ? rawSource : rawSource.toString('latin1');
      const m =
        raw.match(/Final-Recipient:\s*rfc822;\s*<?([^\s<>]+@[^\s<>]+)>?/i) ||
        raw.match(/Original-Recipient:\s*[^;]+;\s*<?([^\s<>]+@[^\s<>]+)>?/i);
      cand = m ? m[1] : '';
    }
    bounceRecipient = cand ? cand.toLowerCase().replace(/[>.,;]+$/, '') : null;
  }
  // A genuine bounce only when we resolved the failed recipient; otherwise treat as normal mail.
  return { autoReply: autoReply && !bounceRecipient, bounceRecipient };
}

interface ImapCreds {
  imapHost?: string;
  imapPort?: number;
  user: string;
  pass: string;
}

/** Fetch INBOX messages received since `since`. Returns [] (never throws) on any failure. */
export async function fetchInboundSince(creds: SmtpCreds & ImapCreds, since: Date): Promise<InboundEmail[]> {
  if (!creds.imapHost) return [];
  const client = new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort || 993,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false
  });

  const out: InboundEmail[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch({ since }, { source: true })) {
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value?.[0];
          const fromAddress = (from?.address || '').toLowerCase();
          const { autoReply, bounceRecipient } = classify(parsed, msg.source, fromAddress);
          out.push({
            messageId: parsed.messageId || String(msg.uid),
            fromAddress,
            fromName: from?.name || '',
            subject: parsed.subject || '(no subject)',
            text: (parsed.text || '').slice(0, 4000),
            date: parsed.date || new Date(),
            autoReply,
            bounceRecipient
          });
        } catch {
          /* skip unparseable message */
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
  }
  return out;
}
