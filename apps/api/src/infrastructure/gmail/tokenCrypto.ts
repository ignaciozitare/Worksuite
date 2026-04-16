// ─────────────────────────────────────────────────────────────────────────────
// Symmetric encryption for OAuth tokens at rest.
// Uses AES-256-GCM with a server-side key loaded from EMAIL_INTEL_TOKEN_KEY.
// The key must be 32 bytes, provided as a base64 string in the env var.
//
// Generate a key with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// If the env var is missing, encryption is a no-op (tokens stored as-is).
// This keeps local dev simple but MUST be configured in production. The
// OAuth routes return 503 "not configured" before we ever try to persist,
// so in practice missing-key-in-prod is blocked earlier.
// ─────────────────────────────────────────────────────────────────────────────

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SCHEME_PREFIX = 'enc:v1:';

function loadKey(): Buffer | null {
  const raw = process.env.EMAIL_INTEL_TOKEN_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(`EMAIL_INTEL_TOKEN_KEY must decode to 32 bytes, got ${buf.length}`);
  }
  return buf;
}

export function encryptToken(plain: string): string {
  const key = loadKey();
  if (!key) return plain;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]).toString('base64');
  return `${SCHEME_PREFIX}${payload}`;
}

export function decryptToken(cipherOrPlain: string): string {
  if (!cipherOrPlain.startsWith(SCHEME_PREFIX)) return cipherOrPlain;
  const key = loadKey();
  if (!key) {
    throw new Error('EMAIL_INTEL_TOKEN_KEY missing but encrypted token found — refusing to decrypt');
  }
  const payload = Buffer.from(cipherOrPlain.slice(SCHEME_PREFIX.length), 'base64');
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
