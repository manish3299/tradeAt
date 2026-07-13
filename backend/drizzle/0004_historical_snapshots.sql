CREATE TABLE IF NOT EXISTS "historical_snapshots" (
  "id" text PRIMARY KEY,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "available_at" timestamp with time zone NOT NULL,
  "snapshot" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "historical_snapshots_workspace_available_idx" ON "historical_snapshots" ("workspace_id", "available_at");
