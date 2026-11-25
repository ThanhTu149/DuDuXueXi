import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

/** Băm mật khẩu đồng bộ (dùng cho CLI/seed). */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(password), salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString('hex');
  return { hash: derived, salt };
}

/** So khớp mật khẩu đồng bộ theo thời gian hằng. */
export function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  try {
    const derived = scryptSync(String(password), String(salt), SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const expected = Buffer.from(String(storedHash), 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Băm mật khẩu bất đồng bộ trên libuv threadpool để không block event loop HTTP. */
export async function hashPasswordAsync(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(String(password), salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS)).toString('hex');
  return { hash: derived, salt };
}

/** So khớp mật khẩu bất đồng bộ theo thời gian hằng (chống timing attack & nghẽn event loop). */
export async function verifyPasswordAsync(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  try {
    const derived = await scryptAsync(String(password), String(salt), SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const expected = Buffer.from(String(storedHash), 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Sinh session token ngẫu nhiên 32 byte (64 ký tự hex). */
export function generateSessionToken() {
  return randomBytes(32).toString('hex');
}

/** Băm SHA-256 của session token để lưu trong DB (không lưu token thô). */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Dẫn xuất khoá 32 byte cho AES-256-GCM từ chuỗi bí mật của server. */
function deriveAesKey(secret) {
  return createHash('sha256').update(`dudu-aes256:${String(secret)}`).digest();
}

/** Mã hoá bí mật (vd: Gemini API key của người dùng) bằng AES-256-GCM. */
export function encryptSecret(plaintext, secret) {
  const key = deriveAesKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/** Giải mã bí mật AES-256-GCM. Trả null nếu giải mã thất bại. */
export function decryptSecret(enc, iv, tag, secret) {
  if (!enc || !iv || !tag) return null;
  try {
    const key = deriveAesKey(secret);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/** Che API key để chỉ hiển thị gợi ý ngắn (không lộ key thật). */
export function maskApiKey(apiKey) {
  const value = String(apiKey || '').trim();
  if (!value) return '';
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/** Sinh mã chia sẻ ngắn dễ đọc cho khóa học cộng đồng. */
export function generateShareCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}
