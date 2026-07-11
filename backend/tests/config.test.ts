import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const valid = {
  DEPENDENCY_MODE: 'external',
  DATABASE_URL: 'postgresql://localhost/tradeat',
  REDIS_URL: 'redis://localhost:6379',
};
describe('loadConfig', () => {
  it('applies safe defaults', () => {
    expect(loadConfig(valid)).toMatchObject({
      host: '127.0.0.1',
      port: 3000,
      nodeEnv: 'development',
      dependencyMode: 'external',
    });
  });
  it('uses lite dependencies by default', () => {
    expect(loadConfig({})).toMatchObject({
      dependencyMode: 'lite',
      databaseUrl: undefined,
      redisUrl: undefined,
    });
  });
  it('requires URLs in external dependency mode', () => {
    expect(() => loadConfig({ DEPENDENCY_MODE: 'external' })).toThrow(
      'DATABASE_URL and REDIS_URL are required',
    );
  });
  it('rejects invalid ports', () => {
    expect(() => loadConfig({ ...valid, PORT: '70000' })).toThrow();
  });
});
