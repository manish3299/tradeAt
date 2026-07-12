import { describe, expect, it } from 'vitest';
import { AuthService } from '../src/application/auth-service.js';
import type { Clock } from '../src/domain/identity.js';
import { InMemoryIdentityStore } from '../src/infrastructure/identity/in-memory-identity-store.js';
import { OpaqueSecretGenerator } from '../src/infrastructure/security/opaque-secret-generator.js';
import { ScryptPasswordHasher } from '../src/infrastructure/security/scrypt-password-hasher.js';

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

describe('AuthService expiry behavior', () => {
  it('rejects expired access tokens', async () => {
    const clock = new MutableClock(new Date('2026-07-12T00:00:00.000Z'));
    const auth = createAuthService(clock);
    const registered = await auth.register({
      email: 'trader@example.com',
      password: 'strong-passphrase',
    });

    clock.advance(16 * 60 * 1000);

    await expect(auth.authenticate(registered.tokens.accessToken)).resolves.toBeUndefined();
  });

  it('rejects expired refresh tokens', async () => {
    const clock = new MutableClock(new Date('2026-07-12T00:00:00.000Z'));
    const auth = createAuthService(clock);
    const registered = await auth.register({
      email: 'trader@example.com',
      password: 'strong-passphrase',
    });

    clock.advance(31 * 24 * 60 * 60 * 1000);

    await expect(auth.refresh(registered.tokens.refreshToken)).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });
});

function createAuthService(clock: Clock): AuthService {
  return new AuthService(
    new InMemoryIdentityStore(),
    new ScryptPasswordHasher(),
    new OpaqueSecretGenerator(),
    clock,
  );
}
