import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { AuthService } from './application/auth-service.js';
import { CheckReadiness } from './application/check-readiness.js';
import type { DependencyProbe } from './domain/health.js';
import { registerAuthRoutes } from './infrastructure/http/auth-routes.js';
import { InMemoryIdentityStore } from './infrastructure/identity/in-memory-identity-store.js';
import { PostgresIdentityStore } from './infrastructure/identity/postgres-identity-store.js';
import { OpaqueSecretGenerator } from './infrastructure/security/opaque-secret-generator.js';
import { ScryptPasswordHasher } from './infrastructure/security/scrypt-password-hasher.js';

export type AppDependencies = Readonly<{
  config: AppConfig;
  probes: readonly DependencyProbe[];
  authService?: AuthService;
}>;

export async function buildApp({
  config,
  probes,
  authService,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    requestIdHeader: 'x-correlation-id',
  });
  await app.register(cors, { origin: config.nodeEnv === 'production' ? false : true });
  const readiness = new CheckReadiness(probes, config.dependencyCheckTimeoutMs);
  const ownedIdentityStore =
    config.dependencyMode === 'external' && config.databaseUrl
      ? new PostgresIdentityStore(config.databaseUrl)
      : new InMemoryIdentityStore();
  const closeOwnedIdentityStore =
    ownedIdentityStore instanceof PostgresIdentityStore
      ? () => ownedIdentityStore.close()
      : () => Promise.resolve();
  const auth =
    authService ??
    new AuthService(ownedIdentityStore, new ScryptPasswordHasher(), new OpaqueSecretGenerator());

  app.get('/health/live', () => ({ status: 'alive', timestamp: new Date().toISOString() }));
  app.get('/health/ready', async (_request, reply) => {
    const result = await readiness.execute();
    return reply.code(result.status === 'ready' ? 200 : 503).send(result);
  });
  app.get('/api/v1/system/info', () => ({ name: 'TradeAt API', version: '0.1.0' }));
  registerAuthRoutes(app, auth);
  app.addHook('onClose', async () => {
    await Promise.all([
      ...probes.map((probe) => probe.close()),
      authService ? Promise.resolve() : closeOwnedIdentityStore(),
    ]);
  });
  return app;
}
