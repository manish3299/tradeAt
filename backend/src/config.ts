import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DEPENDENCY_MODE: z.enum(['lite', 'external']).default('lite'),
  DATABASE_URL: z.string().url().startsWith('postgresql://').optional(),
  REDIS_URL: z.string().url().startsWith('redis://').optional(),
  DEPENDENCY_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().max(10_000).default(1000),
});

export type AppConfig = Readonly<{
  nodeEnv: z.infer<typeof environmentSchema>['NODE_ENV'];
  host: string;
  port: number;
  logLevel: z.infer<typeof environmentSchema>['LOG_LEVEL'];
  dependencyMode: z.infer<typeof environmentSchema>['DEPENDENCY_MODE'];
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
  dependencyCheckTimeoutMs: number;
}>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = environmentSchema.parse(source);
  if (value.DEPENDENCY_MODE === 'external' && (!value.DATABASE_URL || !value.REDIS_URL)) {
    throw new Error('DATABASE_URL and REDIS_URL are required when DEPENDENCY_MODE=external');
  }
  return {
    nodeEnv: value.NODE_ENV,
    host: value.HOST,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    dependencyMode: value.DEPENDENCY_MODE,
    databaseUrl: value.DATABASE_URL,
    redisUrl: value.REDIS_URL,
    dependencyCheckTimeoutMs: value.DEPENDENCY_CHECK_TIMEOUT_MS,
  };
}
