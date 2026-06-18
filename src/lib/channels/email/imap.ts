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
          out.push({
            messageId: parsed.messageId || String(msg.uid),
            fromAddress: (from?.address || '').toLowerCase(),
            fromName: from?.name || '',
            subject: parsed.subject || '(no subject)',
            text: (parsed.text || '').slice(0, 4000),
            date: parsed.date || new Date()
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
