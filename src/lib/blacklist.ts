// Campaign blacklist — addresses/domains to never contact.
// Stored as JSON string[] on Campaign.blacklistJson (also tolerates comma/newline text).
// An entry matches when it equals the full email, or matches the recipient's domain
// ("acme.com" or "@acme.com" → anyone @acme.com or a subdomain).

export function parseBlacklist(json: string | null | undefined): string[] {
  if (!json) return [];
  const raw = String(json).trim();
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    arr = raw.split(/[\n,]+/); // fall back to comma/newline separated text
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
}

export function isBlacklisted(email: string, list: string[]): boolean {
  if (!email || !list.length) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const at = e.indexOf('@');
  const domain = at >= 0 ? e.slice(at + 1) : e;
  for (const entry of list) {
    if (!entry) continue;
    if (entry.includes('@')) {
      if (entry.startsWith('@')) {
        if (domain === entry.slice(1)) return true; // "@acme.com"
      } else if (e === entry) {
        return true; // exact address
      }
    } else if (domain === entry || domain.endsWith('.' + entry)) {
      return true; // bare domain + subdomains
    }
  }
  return false;
}
