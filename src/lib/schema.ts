// Postgres schema. Run with `npm run db:setup` (idempotent: CREATE ... IF NOT EXISTS).

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clients (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  domain text NOT NULL DEFAULT '',
  awin_affiliate_id text NOT NULL DEFAULT '',
  clickref_prefix text NOT NULL DEFAULT '',
  brand_color text NOT NULL DEFAULT '#1d4ed8',
  logo_url text NOT NULL DEFAULT '',
  nav_items text NOT NULL DEFAULT '',
  font_style text NOT NULL DEFAULT 'serif' CHECK (font_style IN ('serif', 'sans')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stores (
  id serial PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  website text NOT NULL,
  awin_merchant_id text NOT NULL DEFAULT '',
  intro text NOT NULL DEFAULT '',
  faqs text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id serial PRIMARY KEY,
  store_id int NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('code', 'deal')),
  title text NOT NULL,
  code text NOT NULL DEFAULT '',
  discount text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  target_url text NOT NULL,
  expires_at text NOT NULL DEFAULT '', -- 'YYYY-MM-DD' or '' (no expiry)
  verified smallint NOT NULL DEFAULT 0,
  archived smallint NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'awin')),
  awin_offer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupons_store_idx ON coupons(store_id);

-- one row per client × store the client publishes
CREATE TABLE IF NOT EXISTS pages (
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id int NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  delivery text NOT NULL DEFAULT 'subdomain' CHECK (delivery IN ('subdomain', 'html', 'widget')),
  published_at timestamptz,
  PRIMARY KEY (client_id, store_id)
);
CREATE INDEX IF NOT EXISTS pages_store_idx ON pages(store_id);

-- one row per click on a coupon button, logged by /go before redirecting to the affiliate link
CREATE TABLE IF NOT EXISTS clicks (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id int NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  coupon_id int REFERENCES coupons(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS clicks_at_idx ON clicks(at);
ALTER TABLE clicks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS activity (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  text text NOT NULL
);

-- the app talks to Postgres directly with the pooler role; keep the tables away from the public Data API
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'newspaper' CHECK (layout IN ('newspaper', 'store'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT '';
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'awin';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS tracking_url text NOT NULL DEFAULT '';
-- square brand icon as a data: URI, served by /store-logo/<slug> (never selected in lists)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo_data text NOT NULL DEFAULT '';
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_source_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_source_check CHECK (source IN ('manual', 'awin', 'web'));
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS source_url text NOT NULL DEFAULT '';
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
-- the hosted subdomain option was dropped: those pages are served like the widget (always current)
UPDATE pages SET delivery = 'widget' WHERE delivery = 'subdomain';
ALTER TABLE pages ALTER COLUMN delivery SET DEFAULT 'widget';
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_delivery_check;
ALTER TABLE pages ADD CONSTRAINT pages_delivery_check CHECK (delivery IN ('html', 'widget'));
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- panel users. client_ids = clients an editor/viewer can see (admins see all).
-- session_version bumps on password change / disable to revoke existing sessions.
CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  client_ids int[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  password_hash text,
  invite_token text UNIQUE,
  invite_expires_at timestamptz,
  session_version int NOT NULL DEFAULT 1,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- magic link sign-in: sha256 of the emailed token, single use, short-lived
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_token_hash text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- one row per AI call (Costes de IA); kept when business data is wiped, it is money already spent
CREATE TABLE IF NOT EXISTS ai_usage (
  id serial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL CHECK (feature IN ('search', 'content', 'style', 'stores')),
  about text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  web_searches int NOT NULL DEFAULT 0,
  cost_total double precision NOT NULL DEFAULT 0,
  cost_gateway double precision NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ai_usage_at_idx ON ai_usage(at);

-- ids stopped being Awin-only: merchant_id = the advertiser's id in the store's own network,
-- external_id = "<network>:<offer id>" for coupons imported from a network (dedupes re-syncs)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'awin_merchant_id') THEN
    ALTER TABLE stores RENAME COLUMN awin_merchant_id TO merchant_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coupons' AND column_name = 'awin_offer_id') THEN
    ALTER TABLE coupons RENAME COLUMN awin_offer_id TO external_id;
  END IF;
END $$;
UPDATE coupons SET external_id = 'awin:' || external_id WHERE source = 'awin' AND external_id NOT LIKE 'awin:%';
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_source_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_source_check
  CHECK (source IN ('manual', 'web', 'awin', 'tradedoubler', 'admitad', 'webgains'));

-- affiliate network API accounts entered from the panel. client_id NULL = our own account;
-- a client's id = that client's own publisher account. credentials = AES-GCM JSON (see lib/secrets.ts)
CREATE TABLE IF NOT EXISTS network_accounts (
  id serial PRIMARY KEY,
  network text NOT NULL CHECK (network IN ('awin', 'tradedoubler', 'admitad', 'webgains')),
  client_id int, -- no FK on purpose: TRUNCATE clients CASCADE (wipe) would take our own account with it
  account_ref text NOT NULL DEFAULT '', -- non-secret id shown in the panel (publisher id, ad space id…)
  credentials text NOT NULL,
  last_sync_at timestamptz,
  last_result text NOT NULL DEFAULT '',
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS network_accounts_owner_idx ON network_accounts(network, coalesce(client_id, 0));
ALTER TABLE network_accounts ENABLE ROW LEVEL SECURITY;
-- calls made before tracking existed, backfilled from measured averages
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS estimated boolean NOT NULL DEFAULT false;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- several publisher ids per network and owner: one row per account_ref (publisher id, ad space id…)
DROP INDEX IF EXISTS network_accounts_owner_idx;
CREATE UNIQUE INDEX IF NOT EXISTS network_accounts_owner_ref_idx ON network_accounts(network, coalesce(client_id, 0), account_ref);
-- Awin publisher id of our own account that imported the coupon / joined the store: the link's awinaffid
-- when the client has no affiliate id of its own (several publisher ids → each coupon keeps the one that can track it)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS publisher_id text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS publisher_id text NOT NULL DEFAULT '';
-- a client's own account in a template network (Tradedoubler, Admitad, Webgains): its tracking link per store,
-- used instead of ours (stores.tracking_url) for that client's clicks. Filled when that account syncs.
CREATE TABLE IF NOT EXISTS client_tracking (
  client_id int NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id int NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  network text NOT NULL,
  tracking_url text NOT NULL,
  PRIMARY KEY (client_id, store_id)
);
ALTER TABLE client_tracking ENABLE ROW LEVEL SECURITY;
`;

// "Borrar todos los datos" in Administración: business data only, users, settings and our own network accounts stay
export const WIPE_DATA_SQL = `DELETE FROM network_accounts WHERE client_id IS NOT NULL; TRUNCATE clicks, activity, pages, coupons, stores, clients RESTART IDENTITY CASCADE;`;
