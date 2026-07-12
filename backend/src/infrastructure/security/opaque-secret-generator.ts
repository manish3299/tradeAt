import { createHash, randomBytes } from 'node:crypto';
import type { SecretGenerator } from '../../domain/identity.js';

export class OpaqueSecretGenerator implements SecretGenerator {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('base64url');
  }
}
