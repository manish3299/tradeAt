import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { loadConfig } from '../../config.js';

const config = loadConfig();
if (config.dependencyMode === 'lite') {
  console.info('Skipping database migrations in DEPENDENCY_MODE=lite.');
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
} finally {
  await pool.end();
}
