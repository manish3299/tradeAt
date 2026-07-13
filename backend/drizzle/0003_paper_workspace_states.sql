CREATE TABLE IF NOT EXISTS "paper_workspace_states" (
  "workspace_id" text PRIMARY KEY REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "state" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
