import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const migrationHealth = pgTable('migration_health', {
  key: text('key').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
