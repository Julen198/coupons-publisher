// Tables of the automatic campaign pages (campaigns-cron.ts): one text per store and shopping date, and the before /
// after report of each date. In SCHEMA_SQL too; the cron also runs it, so a deploy works without running SQL by hand.
export const CAMPAIGN_SQL = `
CREATE TABLE IF NOT EXISTS campaign_guides (
  store_id int NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event text NOT NULL,
  year int NOT NULL,
  status text NOT NULL CHECK (status IN ('scheduled', 'published', 'rejected')),
  content jsonb NOT NULL,
  signals jsonb NOT NULL DEFAULT '{}',
  publish_at timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, event)
);
ALTER TABLE campaign_guides ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS campaign_reports (
  event text NOT NULL,
  year int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('baseline', 'review')),
  data jsonb NOT NULL,
  text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event, year, kind)
);
ALTER TABLE campaign_reports ENABLE ROW LEVEL SECURITY;
`;
