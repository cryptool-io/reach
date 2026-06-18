// At-rest encryption for per-project channel credentials.
// AES-256-GCM with a key derived from APP_SESSION_SECRET via scrypt.
// Stored format: base64(salt).base64(iv).base64(tag).base64(ciphertext)

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { env } from '$env/dynamic/private';

function keyFor(salt: Buffer): Buffer {
  const secret = env.APP_SESSION_SECRET || 'dev-secret-change-me';
  return scryptSync(secret, salt, 32);
}

export function encryptJson(value: unknown): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = keyFor(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [salt, iv, tag, ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptJson<T = Record<string, unknown>>(blob: string): T | null {
  if (!blob) return null;
  try {
    const [saltB, ivB, tagB, dataB] = blob.split('.');
    const salt = Buffer.from(saltB, 'base64');
    const iv = Buffer.from(ivB, 'base64');
    const tag = Buffer.from(tagB, 'base64');
    const data = Buffer.from(dataB, 'base64');
    const key = keyFor(salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Redact secrets for display: keep last 2-4 chars, mask the rest. */
export function maskSecret(s: string | undefined): string {
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}
