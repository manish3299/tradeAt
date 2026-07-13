CREATE TABLE IF NOT EXISTS "replay_outputs" (
  "identity_hash" text PRIMARY KEY NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
