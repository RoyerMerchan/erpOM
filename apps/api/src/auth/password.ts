import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const version = 'scrypt-v1';
const saltLength = 16;
const digestLength = 64;
const options = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, digestLength, options, (error, digest) => {
      if (error) reject(error);
      else resolve(digest);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltLength);
  const digest = await derive(password, salt);
  return [version, salt.toString('hex'), digest.toString('hex')].join('$');
}

export async function verifyPassword(
  password: string,
  encoded: string | undefined,
): Promise<boolean> {
  const [storedVersion, saltHex = '', digestHex = ''] = encoded?.split('$') ?? [];
  const validEncoding =
    storedVersion === version &&
    /^[a-f0-9]{32}$/.test(saltHex) &&
    /^[a-f0-9]{128}$/.test(digestHex);
  const salt = validEncoding ? Buffer.from(saltHex, 'hex') : Buffer.alloc(saltLength);
  const digest = validEncoding ? Buffer.from(digestHex, 'hex') : Buffer.alloc(digestLength);
  const candidate = await derive(password, salt);
  return timingSafeEqual(candidate, digest) && validEncoding;
}
