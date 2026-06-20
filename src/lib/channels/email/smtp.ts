import nodemailer from 'nodemailer';

export interface SmtpCreds {
  host: string;
  port: number;
  secure: boolean; // true = implicit TLS (465); false = STARTTLS (587)
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface SmtpProviderPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  imapHost: string;
  imapPort: number;
  /** step-by-step setup instructions shown in the UI */
  steps: string[];
}

export const SMTP_PRESETS: SmtpProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    steps: [
      'Go to myaccount.google.com → Security and turn ON 2-Step Verification.',
      'Open myaccount.google.com/apppasswords, create an app password (name it "Reach"), and copy the 16-character code.',
      'From email & Username = your full Gmail / Workspace address.',
      'Password = that 16-character app password (NOT your normal password).',
      'Host/port are pre-filled (smtp.gmail.com : 465, SSL on). Click "Add & test".'
    ]
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    steps: [
      'An admin must enable SMTP AUTH for the mailbox: Microsoft 365 admin → Users → (the mailbox) → Mail → "Manage email apps" → tick "Authenticated SMTP" → Save. (PowerShell: Set-CASMailbox -Identity you@domain -SmtpClientAuthenticationDisabled $false)',
      'If the account uses MFA, create an app password at mysignins.microsoft.com/security-info → Add → App password (needs Security Defaults turned off).',
      'Username = your full email address. Password = the app password (or the normal password if there is no MFA).',
      'Host/port are pre-filled (smtp.office365.com : 587, STARTTLS). Wait ~15 min after enabling SMTP AUTH, then click "Add & test".',
      'Still getting 535? Your tenant blocks SMTP AUTH — use the Amazon SES option instead.'
    ]
  },
  {
    id: 'ses',
    label: 'Amazon SES',
    host: 'email-smtp.us-east-1.amazonaws.com',
    port: 587,
    secure: false,
    imapHost: '',
    imapPort: 993,
    steps: [
      'In AWS → SES → "Verified identities", verify your sending domain (add the DKIM CNAME records it gives you) — or at least verify your From address.',
      'Leave the SES sandbox: SES → Account dashboard → "Request production access" (so you can email anyone, not only verified addresses).',
      'SES → "SMTP settings" → "Create SMTP credentials" → download the SMTP username + password (shown only once).',
      'Set the Host region to match your SES region, e.g. email-smtp.eu-west-1.amazonaws.com (default here is us-east-1).',
      'From email = your verified address. Username + Password = the SES SMTP credentials. Port 587, STARTTLS. Click "Add & test".',
      'Note: SES only sends — replies arrive in your normal inbox for that address, so you can leave IMAP blank.'
    ]
  },
  {
    id: 'custom',
    label: 'Custom / other host',
    host: '',
    port: 587,
    secure: false,
    imapHost: '',
    imapPort: 993,
    steps: [
      'Get the SMTP host, port, and whether SSL/TLS is required from your email provider.',
      'Port 465 = SSL/TLS ON. Port 587 = STARTTLS (SSL/TLS off).',
      'Username is usually your full email address; use an app password if the account has 2FA/MFA.',
      'Fill in host / port / username / password, then click "Add & test".'
    ]
  }
];

function transporter(c: SmtpCreds) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass }
  });
}

export async function verifySmtp(c: SmtpCreds): Promise<{ ok: boolean; detail: string }> {
  try {
    await transporter(c).verify();
    return { ok: true, detail: `Connected to ${c.host}:${c.port} as ${c.user}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export async function sendSmtp(
  c: SmtpCreds,
  msg: { to: string; subject: string; body: string; html?: string; unsubscribeUrl?: string }
): Promise<{ ok: boolean; detail: string; messageId?: string }> {
  try {
    // RFC 8058 one-click unsubscribe (now expected by Gmail/Yahoo bulk senders).
    const unsub = msg.unsubscribeUrl
      ? {
          list: { unsubscribe: { url: msg.unsubscribeUrl, comment: 'Unsubscribe' } },
          headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        }
      : {};
    const info = await transporter(c).sendMail({
      from: c.fromName ? `"${c.fromName}" <${c.fromEmail || c.user}>` : c.fromEmail || c.user,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
      ...(msg.html ? { html: msg.html } : {}),
      ...unsub
    });
    return { ok: true, detail: `Sent to ${msg.to}`, messageId: info.messageId };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
