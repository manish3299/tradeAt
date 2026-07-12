import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from '../src/infrastructure/security/scrypt-password-hasher.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the correct password without storing it', async () => {
    const encoded = await hasher.hash('correct horse battery staple');

    expect(encoded).not.toContain('correct horse battery staple');
    await expect(hasher.verify('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(hasher.verify('wrong password', encoded)).resolves.toBe(false);
  });

  it('uses a unique salt for identical passwords', async () => {
    const first = await hasher.hash('same strong password');
    const second = await hasher.hash('same strong password');

    expect(first).not.toBe(second);
  });

  it.each(['', 'not-a-hash', 'scrypt$v=99$n=16384$r=8$p=1$bad$bad'])(
    'rejects malformed or unsupported hash %s',
    async (encoded) => {
      await expect(hasher.verify('anything', encoded)).resolves.toBe(false);
    },
  );
});
