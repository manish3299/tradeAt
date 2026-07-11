import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { CheckReadiness } from './application/check-readiness.js';
import type { DependencyProbe } from './domain/health.js';

export type AppDependencies = Readonly<{ config: AppConfig; probes: readonly DependencyProbe[] }>;

export async function buildApp({ config, probes }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    requestIdHeader: 'x-correlation-id',
  });
  await app.register(cors, { origin: config.nodeEnv === 'production' ? false : true });
  const readiness = new CheckReadiness(probes, config.dependencyCheckTimeoutMs);

  app.get('/health/live', () => ({ status: 'alive', timestamp: new Date().toISOString() }));
  app.get('/health/ready', async (_request, reply) => {
    const result = await readiness.execute();
    return reply.code(result.status === 'ready' ? 200 : 503).send(result);
  });
  app.get('/api/v1/system/info', () => ({ name: 'TradeAt API', version: '0.1.0' }));
  app.addHook('onClose', async () => {
    await Promise.all(probes.map((probe) => probe.close()));
  });
  return app;
}
