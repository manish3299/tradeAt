import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const migrationHealth = pgTable('migration_health', {
  key: text('key').primaryKey(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const memberships = pgTable(
  'memberships',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.workspaceId] }),
    index('memberships_workspace_idx').on(table.workspaceId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    accessTokenHash: text('access_token_hash').notNull(),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sessions_access_token_hash_unique').on(table.accessTokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [index('refresh_tokens_user_idx').on(table.userId)],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').notNull(),
  },
  (table) => [
    index('audit_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    index('audit_events_user_time_idx').on(table.userId, table.occurredAt),
  ],
);

export const instruments = pgTable(
  'instruments',
  {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull(),
    name: text('name').notNull(),
    venue: text('venue').notNull(),
    providerSymbol: text('provider_symbol').notNull(),
    assetClass: text('asset_class').notNull(),
    currency: text('currency').notNull(),
    timezone: text('timezone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('instruments_provider_identity_unique').on(
      table.venue,
      table.providerSymbol,
      table.assetClass,
    ),
  ],
);

export const bars = pgTable(
  'bars',
  {
    instrumentId: text('instrument_id')
      .notNull()
      .references(() => instruments.id, { onDelete: 'cascade' }),
    timeframe: text('timeframe').notNull(),
    openTime: timestamp('open_time', { withTimezone: true }).notNull(),
    closeTime: timestamp('close_time', { withTimezone: true }).notNull(),
    open: text('open').notNull(),
    high: text('high').notNull(),
    low: text('low').notNull(),
    close: text('close').notNull(),
    volume: text('volume').notNull(),
    source: text('source').notNull(),
    revision: text('revision').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.instrumentId, table.timeframe, table.openTime, table.source, table.revision],
    }),
    index('bars_instrument_time_idx').on(table.instrumentId, table.openTime),
  ],
);

export const replayOutputs = pgTable('replay_outputs', {
  identityHash: text('identity_hash').primaryKey(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paperWorkspaceStates = pgTable('paper_workspace_states', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
