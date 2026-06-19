// Microsoft Graph sendMail — the durable M365 sending path (Microsoft is retiring SMTP submission).
// App-only auth (client credentials): the user registers one Azure app with Mail.Send (application)
// permission + admin consent, and supplies tenantId / clientId / clientSecret. No per-user OAuth,
// no token refresh storage — we fetch a short-lived app token per send.

export interface GraphCreds {
  type?: 'graph';
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fromName?: string;
  fromEmail: string;
}

async function getToken(c: GraphCreds): Promise<string> {
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(j.error_description || j.error || `token request failed (${r.status})`);
  }
  return j.access_token;
}

/** Verify the Azure app credentials by acquiring an app token. */
export async function verifyGraph(c: GraphCreds): Promise<{ ok: boolean; detail: string }> {
  try {
    await getToken(c);
    return { ok: true, detail: 'Authenticated with Microsoft Graph' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

/** Send one email as fromEmail via Graph /users/{from}/sendMail. */
export async function sendGraphMail(
  c: GraphCreds,
  msg: { to: string; subject: string; body: string; html?: string }
): Promise<{ ok: boolean; detail: string }> {
  try {
    const token = await getToken(c);
    const payload = {
      message: {
        subject: msg.subject,
        body: { contentType: msg.html ? 'HTML' : 'Text', content: msg.html || msg.body },
        toRecipients: [{ emailAddress: { address: msg.to } }],
        from: { emailAddress: { address: c.fromEmail } }
      },
      saveToSentItems: true
    };
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.fromEmail)}/sendMail`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.status === 202) return { ok: true, detail: 'sent via Microsoft Graph' };
    const t = await r.text().catch(() => '');
    return { ok: false, detail: `Graph ${r.status}: ${t.slice(0, 220)}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
