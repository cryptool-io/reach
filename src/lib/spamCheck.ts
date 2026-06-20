// Lightweight spam-trigger scan for cold email (Woodpecker-style "spam check").
// Heuristic, not SpamAssassin: flags common trigger phrases, shouty caps, exclamation/link
// overload and money amounts. Pure + dependency-free so it runs on the server (launch guard)
// and in the browser (live editor readout). Returns a score + human-readable issues.

const TRIGGER_PHRASES = [
  'risk-free', 'risk free', '100% free', 'act now', 'apply now', 'buy now', 'order now',
  'call now', 'click here', 'click below', 'limited time', 'congratulations', 'you are a winner',
  'you have been selected', 'guaranteed', 'no obligation', 'no cost', 'no fees', 'no catch',
  'cash bonus', 'earn money', 'make money', 'extra income', 'double your', 'million dollars',
  'lowest price', 'best price', 'incredible deal', 'special promotion', 'amazing offer',
  'credit card', 'consolidate debt', 'weight loss', 'this is not spam', 'dear friend',
  'work from home', 'be your own boss', 'increase sales', 'free gift', 'free trial', 'free access'
];

export type SpamLevel = 'clean' | 'low' | 'medium' | 'high';

export interface SpamResult {
  score: number; // 0 = clean; higher = spammier
  level: SpamLevel;
  issues: string[];
}

export function spamCheck(subject: string, body: string): SpamResult {
  const issues: string[] = [];
  let score = 0;
  const subj = subject ?? '';
  const text = `${subj}\n${body ?? ''}`;
  const lower = text.toLowerCase();

  const hits = TRIGGER_PHRASES.filter((w) => lower.includes(w));
  if (hits.length) {
    score += hits.length * 2;
    issues.push(`Trigger word${hits.length > 1 ? 's' : ''}: ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? '…' : ''}`);
  }

  // SHOUTY words (4+ consecutive caps), excluding common acronyms/protocols.
  const shout = [...new Set((text.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !['STOP', 'HTTPS', 'HTTP'].includes(w)))];
  if (shout.length) {
    score += shout.length;
    issues.push(`All-caps word${shout.length > 1 ? 's' : ''}: ${shout.slice(0, 5).join(', ')}`);
  }

  const bangs = (text.match(/!/g) || []).length;
  if (bangs >= 3) {
    score += bangs - 2;
    issues.push(`Too many exclamation marks (${bangs})`);
  }

  if (/[$€£]\s?\d/.test(text)) {
    score += 2;
    issues.push('Money amounts ($/€/£)');
  }

  const links = (lower.match(/https?:\/\//g) || []).length;
  if (links >= 3) {
    score += links - 2;
    issues.push(`Many links (${links}) — one is safest`);
  }

  if (subj && subj === subj.toUpperCase() && /[A-Z]{3,}/.test(subj)) {
    score += 3;
    issues.push('Subject is ALL CAPS');
  }

  const level: SpamLevel = score === 0 ? 'clean' : score <= 3 ? 'low' : score <= 7 ? 'medium' : 'high';
  return { score, level, issues };
}
