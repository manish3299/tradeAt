import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../../domain/identity.js';

const VERSION = 1;
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      keyLength,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
  });
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await derive(password, salt, KEY_LENGTH);

    return [
      'scrypt',
      `v=${VERSION}`,
      `n=${COST}`,
      `r=${BLOCK_SIZE}`,
      `p=${PARALLELIZATION}`,
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = parseHash(encodedHash);
    if (!parsed) return false;

    try {
      const actual = await derive(password, parsed.salt, parsed.expected.length);
      return timingSafeEqual(actual, parsed.expected);
    } catch {
      return false;
    }
  }
}

function parseHash(encodedHash: string):
  | Readonly<{
      cost: number;
      blockSize: number;
      parallelization: number;
      salt: Buffer;
      expected: Buffer;
    }>
  | undefined {
  const [algorithm, versionPart, costPart, blockPart, parallelPart, saltPart, hashPart] =
    encodedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    versionPart !== `v=${VERSION}` ||
    !costPart?.startsWith('n=') ||
    !blockPart?.startsWith('r=') ||
    !parallelPart?.startsWith('p=') ||
    !saltPart ||
    !hashPart
  ) {
    return undefined;
  }

  const cost = Number(costPart.slice(2));
  const blockSize = Number(blockPart.slice(2));
  const parallelization = Number(parallelPart.slice(2));
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) {
    return undefined;
  }

  try {
    const salt = Buffer.from(saltPart, 'base64url');
    const expected = Buffer.from(hashPart, 'base64url');
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return undefined;
    return { cost, blockSize, parallelization, salt, expected };
  } catch {
    return undefined;
  }
}
