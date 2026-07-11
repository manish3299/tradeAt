CREATE TABLE IF NOT EXISTS "migration_health" (
  "key" text PRIMARY KEY NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
