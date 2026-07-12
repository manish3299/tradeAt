CREATE TABLE IF NOT EXISTS "instruments" (
  "id" text PRIMARY KEY NOT NULL,
  "symbol" text NOT NULL,
  "name" text NOT NULL,
  "venue" text NOT NULL,
  "provider_symbol" text NOT NULL,
  "asset_class" text NOT NULL,
  "currency" text NOT NULL,
  "timezone" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "instruments_provider_identity_unique"
  ON "instruments" ("venue", "provider_symbol", "asset_class");

CREATE TABLE IF NOT EXISTS "bars" (
  "instrument_id" text NOT NULL REFERENCES "instruments" ("id") ON DELETE cascade,
  "timeframe" text NOT NULL,
  "open_time" timestamp with time zone NOT NULL,
  "close_time" timestamp with time zone NOT NULL,
  "open" text NOT NULL,
  "high" text NOT NULL,
  "low" text NOT NULL,
  "close" text NOT NULL,
  "volume" text NOT NULL,
  "source" text NOT NULL,
  "revision" text NOT NULL,
  "received_at" timestamp with time zone NOT NULL,
  CONSTRAINT "bars_pk" PRIMARY KEY (
    "instrument_id",
    "timeframe",
    "open_time",
    "source",
    "revision"
  )
);

CREATE INDEX IF NOT EXISTS "bars_instrument_time_idx"
  ON "bars" ("instrument_id", "open_time");
