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
  /** rough setup effort, shown as a badge so users can self-select */
  difficulty: 'Easy' | 'Medium' | 'Advanced';
  /** one-line "use this if…" guidance on the picker card */
  bestFor: string;
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
    difficulty: 'Easy',
    bestFor: 'Your email is a @gmail.com or Google Workspace address.',
    steps: [
      'This option is for Google email (@gmail.com or Google Workspace). If your email is on Microsoft, use the Outlook or Microsoft 365 (Graph) option instead.',
      'Turn on 2-Step Verification: open myaccount.google.com/security, find "2-Step Verification", and switch it ON (Google requires this before it will give you an app password).',
      'Create an app password: open myaccount.google.com/apppasswords, type a name like "Reach", click Create, and copy the 16-character code it shows.',
      'In the form below: set both "From email" and "Username" to your full Google email address.',
      'In the "App password" box, paste that 16-character code (spaces are fine) — do NOT use your normal Google password.',
      'Host and port are already filled in (smtp.gmail.com, 465, SSL on). Just click "Add & test".'
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
    difficulty: 'Medium',
    bestFor: 'Outlook.com, or a Microsoft 365 domain where SMTP is allowed.',
    steps: [
      'Heads up: most Microsoft 365 work domains BLOCK this by default. If you get a "535 Authentication unsuccessful" error, that is the block — switch to the "Microsoft 365 (Graph API)" option, which is the reliable way for Microsoft domains.',
      'To use SMTP anyway, an admin must turn it on: go to admin.microsoft.com → Users → Active users → (your user) → Mail tab → "Manage email apps" → tick "Authenticated SMTP" → Save. Then wait about 15 minutes.',
      'If the account uses MFA / 2-factor, create an app password at mysignins.microsoft.com/security-info → Add sign-in method → App password.',
      'In the form below: set "From email" and "Username" to your full email address.',
      'In the "App password" box, paste the app password (or your normal password if the account has no MFA).',
      'Host and port are already filled in (smtp.office365.com, 587, STARTTLS). Click "Add & test".'
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
    difficulty: 'Medium',
    bestFor: 'Sending from your own domain at volume (needs an AWS account).',
    steps: [
      'You need an AWS account (aws.amazon.com). This is a good choice when your email host blocks SMTP, or to send lots of mail from your own domain.',
      'Verify your domain: AWS Console → search "SES" → Verified identities → Create identity → Domain. SES gives you a few DNS records (CNAMEs) — add them to your domain\'s DNS. (Or just verify a single From address to start.)',
      'Leave the test sandbox: SES → Account dashboard → "Request production access" — otherwise you can only email addresses you have verified.',
      'Get your sending keys: SES → SMTP settings → "Create SMTP credentials" → download the SMTP username and password (shown only once — save them).',
      'Set the "SMTP host" below to your SES region, e.g. email-smtp.eu-west-1.amazonaws.com (it defaults to us-east-1 — change it if your SES is elsewhere).',
      'In the form: "From email" = your verified address; "Username" + "App password" = the SES SMTP username + password. Leave port 587. Click "Add & test". (SES only sends — replies land in your normal inbox, so IMAP can stay blank.)'
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
    difficulty: 'Medium',
    bestFor: 'Any other email provider that gives you SMTP details.',
    steps: [
      'Ask your email provider (or check their help docs) for three things: the SMTP host, the port, and whether SSL/TLS is required.',
      'Pick the port: 465 means SSL/TLS is ON (tick the box). 587 means STARTTLS (leave the SSL/TLS box unticked).',
      'In the form below: "Username" is usually your full email address. If the account has 2-factor login, create an app password and use that instead of your normal password.',
      '(Optional but recommended) Fill in the IMAP host/port too — that lets Reach read replies, bounces and out-of-office messages automatically.',
      'Fill in host, port, username and password, then click "Add & test".'
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
