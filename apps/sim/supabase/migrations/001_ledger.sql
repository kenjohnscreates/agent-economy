-- Agent Town sim ledger (ARCHITECTURE §6.4). Apply locally; do not run against prod from CI.
-- ticks: one row per sim tick; actions: idempotent on (tick, agent, kind).

CREATE TABLE IF NOT EXISTS ticks (
  id INTEGER PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phase TEXT NOT NULL CHECK (phase IN ('boom', 'borrow', 'default', 'hike', 'recover'))
);

CREATE TABLE IF NOT EXISTS actions (
  tick INTEGER NOT NULL REFERENCES ticks (id),
  agent TEXT NOT NULL,
  kind TEXT NOT NULL,
  tx TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (tick, agent, kind)
);

CREATE TABLE IF NOT EXISTS narration (
  tick INTEGER NOT NULL,
  agent TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (tick, agent)
);

CREATE TABLE IF NOT EXISTS cache_agents (
  name TEXT PRIMARY KEY,
  json JSONB NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
