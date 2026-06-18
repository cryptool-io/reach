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
      'Turn on 2-Step Verification at myaccount.google.com → Security.',
      'Open myaccount.google.com/apppasswords and create an App password (app: Mail).',
      'Copy the 16-character password Google shows you.',
      'Username = your full Gmail address. Password = that App password (not your normal password).'
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
      'Use your full email address as the username.',
      'If your org enforces MFA, create an App password in Microsoft account → Security.',
      'SMTP AUTH must be enabled for the mailbox (admins: Microsoft 365 admin center → Active users → Mail).'
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
      "Get SMTP host, port, and whether SSL/TLS is required from your email provider.",
      'Port 465 = SSL (secure on). Port 587 = STARTTLS (secure off).',
      'Username is usually your full email address.'
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
  msg: { to: string; subject: string; body: string; html?: string }
): Promise<{ ok: boolean; detail: string; messageId?: string }> {
  try {
    const info = await transporter(c).sendMail({
      from: c.fromName ? `"${c.fromName}" <${c.fromEmail || c.user}>` : c.fromEmail || c.user,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
      ...(msg.html ? { html: msg.html } : {})
    });
    return { ok: true, detail: `Sent to ${msg.to}`, messageId: info.messageId };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
