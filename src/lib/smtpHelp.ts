// Maps an SMTP / connection error message to actionable fix instructions shown next to a
// mailbox that's in an error state. Pure (no imports) — safe to use on client or server.

export interface SmtpHelp {
  summary: string;
  steps: string[];
}

export function diagnoseSmtpError(message: string | null | undefined): SmtpHelp | null {
  const m = (message || '').toLowerCase();
  if (!m.trim()) return null;

  const isOutlook = /outlook|office365|microsoft|exchange/.test(m);
  const isGmail = /gmail|google/.test(m);

  // Microsoft 365 auth rejection (e.g. 535 5.7.3 Authentication unsuccessful)
  if (/5\.7\.3|authentication unsuccessful/.test(m) || (isOutlook && /(invalid login|535|auth)/.test(m))) {
    return {
      summary: 'Microsoft 365 rejected the login — enable Authenticated SMTP and use an app password.',
      steps: [
        'Microsoft 365 admin → Users → this mailbox → Mail → Manage email apps → tick "Authenticated SMTP" → Save. (M365 disables it by default.)',
        'PowerShell alternative: Set-CASMailbox -Identity you@domain -SmtpClientAuthenticationDisabled $false',
        'If the account has MFA, create an App password at mysignins.microsoft.com/security-info and paste that here (not your normal password).',
        'Settings: host smtp.office365.com · port 587 · SSL/TLS OFF (STARTTLS) · username = full email address.',
        'Wait ~5 min, then click Test. If it still fails, the tenant blocks SMTP AUTH — use Amazon SES or a Google Workspace inbox instead.'
      ]
    };
  }

  // Google auth rejection (needs an app password)
  if (/5\.7\.8|username and password not accepted|application-specific password|534/.test(m) || (isGmail && /(invalid login|535|auth)/.test(m))) {
    return {
      summary: 'Google rejected the login — you need an App password, not your normal password.',
      steps: [
        'Turn on 2-Step Verification at myaccount.google.com → Security.',
        'Create an App password at myaccount.google.com/apppasswords (app: Mail) — 16 characters.',
        'Paste that App password here; username = your full Gmail / Workspace address.',
        'Settings: host smtp.gmail.com · port 465 · SSL/TLS ON. Then click Test.'
      ]
    };
  }

  // Generic auth failure
  if (/invalid login|535|authentication failed|auth.*fail|password not accepted|not authenticated|credentials/.test(m)) {
    return {
      summary: 'The username or password was rejected.',
      steps: [
        'Check the username (usually your full email address) and password.',
        'If the account has 2FA/MFA, use an App password, not your login password.',
        'Confirm your provider allows authenticated SMTP sending (some disable it by default).',
        'Re-enter the password and click Test.'
      ]
    };
  }

  // Connection / DNS problems
  if (/econnrefused|etimedout|enotfound|eai_again|getaddrinfo|timed out|connect|socket|network/.test(m)) {
    return {
      summary: 'Could not reach the mail server — check host, port and firewall.',
      steps: [
        'Verify host + port (Gmail: smtp.gmail.com:465 · Microsoft 365: smtp.office365.com:587).',
        'Port 465 → SSL/TLS ON. Port 587 → SSL/TLS OFF (STARTTLS).',
        'Make sure outbound SMTP isn\'t blocked by your host/firewall, then click Test.'
      ]
    };
  }

  // TLS / SSL mismatch
  if (/certificate|self.signed|wrong version number|\bssl\b|\btls\b/.test(m)) {
    return {
      summary: "TLS/SSL mismatch — your port and SSL setting don't match.",
      steps: [
        'Port 465 needs SSL/TLS ON. Port 587 needs SSL/TLS OFF (STARTTLS).',
        'Flip the SSL/TLS toggle to match the port, then click Test.'
      ]
    };
  }

  // Relay / not authorized to send as
  if (/relay|5\.7\.1|not permitted|not allowed to send|sender denied|send as/.test(m)) {
    return {
      summary: "The server refused to relay — the From address isn't authorized for this account.",
      steps: [
        'The "From email" must be an address this account is allowed to send as.',
        'For an alias, make sure it\'s authorized on the account (or use the primary address).',
        'Check "send as" permissions with your provider, then click Test.'
      ]
    };
  }

  // Rate limit / throttle
  if (/rate|too many|\b421\b|throttl|quota|exceeded/.test(m)) {
    return {
      summary: 'Rate-limited by the provider — slow down or wait.',
      steps: ['Lower this mailbox\'s daily limit and keep warm-up on.', 'Wait a while, add more mailboxes to spread volume, then click Test.']
    };
  }

  return {
    summary: 'Sending failed — verify host, port, SSL, username and password.',
    steps: [
      'Confirm host/port/SSL match your provider (465 = SSL, 587 = STARTTLS).',
      'Use an App password if the account has 2FA/MFA.',
      'Re-enter credentials and click Test.'
    ]
  };
}
