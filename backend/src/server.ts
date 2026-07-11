import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { LocalProbe, PostgresProbe, RedisProbe } from './infrastructure/dependency-probes.js';
import type { DependencyProbe } from './domain/health.js';

const config = loadConfig();
const probes: readonly DependencyProbe[] =
  config.dependencyMode === 'external'
    ? [new PostgresProbe(config.databaseUrl ?? ''), new RedisProbe(config.redisUrl ?? '')]
    : [new LocalProbe('local-runtime'), new LocalProbe('local-storage')];
const app = await buildApp({
  config,
  probes,
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutdown requested');
  await app.close();
  process.exitCode = 0;
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal(error, 'server failed to start');
  process.exitCode = 1;
}
