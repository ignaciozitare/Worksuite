/**
 * AES-256-GCM encryption/decryption using the Web Crypto API.
 * The encryption key is derived from VITE_ENCRYPTION_KEY via PBKDF2.
 *
 * Ciphertext format: base64( iv(12) || ciphertext || tag )
 */

const ALGO = 'AES-GCM';
const IV_LEN = 12;
const SALT = new TextEncoder().encode('worksuite-ficha-salt');

let _key: CryptoKey | null = null;

async function getKey(): Promise<CryptoKey> {
  if (_key) return _key;

  const raw = import.meta.env.VITE_ENCRYPTION_KEY as string | undefined;
  if (!raw) throw new Error('VITE_ENCRYPTION_KEY is not set');

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(raw),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  _key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return _key;
}

export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  const merged = new Uint8Array(iv.length + cipherBuf.byteLength);
  merged.set(iv, 0);
  merged.set(new Uint8Array(cipherBuf), iv.length);
  return btoa(String.fromCharCode(...merged));
}

export async function decrypt(ciphertext: string): Promise<string> {
  if (!ciphertext) return '';
  const key = await getKey();
  const raw = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = raw.slice(0, IV_LEN);
  const data = raw.slice(IV_LEN);
  const plainBuf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
  return new TextDecoder().decode(plainBuf);
}
