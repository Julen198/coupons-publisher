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
-- (the old one-account-per-owner index is dropped below; creating it first fails once an owner has several accounts)
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
-- category readers browse by on the public site ('' = none), and short facts for its guide: "Etiqueta | Valor" per line
ALTER TABLE stores ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_category_check;
ALTER TABLE stores ADD CONSTRAINT stores_category_check
  CHECK (category IN ('', 'tecnologia', 'zapatillas', 'moda', 'hogar', 'deporte', 'viajes'));
ALTER TABLE stores ADD COLUMN IF NOT EXISTS facts text NOT NULL DEFAULT '';
-- the allowed sources and networks, defined once: an older, shorter list re-added first would reject rows a newer network already wrote
-- Adtraction, Effiliation, Kwanko, Affilae and Partnerize read through their APIs too
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_source_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_source_check
  CHECK (source IN ('manual', 'web', 'awin', 'tradedoubler', 'admitad', 'webgains', 'cj', 'rakuten', 'impact', 'adtraction', 'effiliation', 'kwanko', 'affilae', 'partnerize'));
ALTER TABLE network_accounts DROP CONSTRAINT IF EXISTS network_accounts_network_check;
ALTER TABLE network_accounts ADD CONSTRAINT network_accounts_network_check
  CHECK (network IN ('awin', 'tradedoubler', 'admitad', 'webgains', 'cj', 'rakuten', 'impact', 'adtraction', 'effiliation', 'kwanko', 'affilae', 'partnerize'));
-- Telegram: '' = not sent yet, review = in the admin's chat, published / discarded / expired in the public channel
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS telegram_status text NOT NULL DEFAULT '';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS telegram_message_id bigint;
-- readers (email sign-in, no password), their votes and comments on coupons, and coupons they share
CREATE TABLE IF NOT EXISTS readers (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  handle text UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  session_version int NOT NULL DEFAULT 1,
  login_token_hash text UNIQUE,
  login_expires_at timestamptz,
  link_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE readers ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS votes (
  reader_id int NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  coupon_id int NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reader_id, coupon_id)
);
CREATE INDEX IF NOT EXISTS votes_coupon_idx ON votes(coupon_id);
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS comments (
  id serial PRIMARY KEY,
  coupon_id int NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  reader_id int NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  body text NOT NULL,
  hidden smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_coupon_idx ON comments(coupon_id, created_at);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
-- who shared a coupon, and its moderation state ('' = normal)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS shared_by int REFERENCES readers(id) ON DELETE SET NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS review text NOT NULL DEFAULT '';
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_review_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_review_check CHECK (review IN ('', 'pending', 'rejected'));
-- readers mark comments as useful; replies point at their top-level comment (one level deep)
CREATE TABLE IF NOT EXISTS comment_votes (
  reader_id int NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  comment_id int NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reader_id, comment_id)
);
CREATE INDEX IF NOT EXISTS comment_votes_comment_idx ON comment_votes(comment_id);
ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id int REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_id) WHERE parent_id IS NOT NULL;
-- "Sobre este chollo": original text per deal, drafted by AI and public only once an editor approves it
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS about text NOT NULL DEFAULT '';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS about_status text NOT NULL DEFAULT '';
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_about_status_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_about_status_check CHECK (about_status IN ('', 'draft', 'approved'));
-- product image from a network feed (https only, '' = none), deals readers save, and readers' "ha caducado" reports
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS saved_deals (
  reader_id int NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  coupon_id int NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reader_id, coupon_id)
);
ALTER TABLE saved_deals ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS expiry_reports (
  reader_id int NOT NULL REFERENCES readers(id) ON DELETE CASCADE,
  coupon_id int NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reader_id, coupon_id)
);
CREATE INDEX IF NOT EXISTS expiry_reports_coupon_idx ON expiry_reports(coupon_id);
ALTER TABLE expiry_reports ENABLE ROW LEVEL SECURITY;
-- when we last looked for a product photo on the deal's landing page (og:image): tried once, again after 30 days if none
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS image_checked_at timestamptz;
-- why an editor rejected a shared deal (one of REJECT_REASONS, '' = none), shown to the reader on /cuenta
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS review_reason text NOT NULL DEFAULT '';
-- "Avísame antes de cada fecha" (/calendario): who is subscribed, and which date each reader was already emailed about
CREATE TABLE IF NOT EXISTS date_alert_subs (
  reader_id int PRIMARY KEY REFERENCES readers(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE date_alert_subs ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS date_alert_sends (
  reader_id int REFERENCES readers(id) ON DELETE CASCADE,
  event_key text,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reader_id, event_key)
);
ALTER TABLE date_alert_sends ENABLE ROW LEVEL SECURITY;
-- the store's wordmark (logo with its name, data: URI, '' = none) for the landscape logo boxes; logo_data stays the square icon
ALTER TABLE stores ADD COLUMN IF NOT EXISTS wordmark_data text NOT NULL DEFAULT '';
-- the country a store sells in (ISO 3166-1 alpha-2, upper case, '' = unknown): the public site only lists ES ones (onSpanishSite);
-- where it came from: 'network' (its affiliate API), 'inferred' (scripts/backfill-store-country.ts), 'manual' (the panel, never overwritten)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS country_source text NOT NULL DEFAULT '';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_country_check;
ALTER TABLE stores ADD CONSTRAINT stores_country_check CHECK (country ~ '^([A-Z]{2})?$');
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_country_source_check;
ALTER TABLE stores ADD CONSTRAINT stores_country_source_check CHECK (country_source IN ('', 'network', 'inferred', 'manual'));
-- coupons in another language shown in Spanish: the AI's translation (or an editor's), its state and what it was made from
-- ('' = not translated, 'auto' = AI, public right away, 'approved' = checked by an editor, 'skip' = "No traducir");
-- translated_from = md5(title || E'\\n' || description) of the source it translates, so a changed source is translated again
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS title_es text NOT NULL DEFAULT '';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description_es text NOT NULL DEFAULT '';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS translation_status text NOT NULL DEFAULT '';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS translated_from text NOT NULL DEFAULT '';
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_translation_status_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_translation_status_check CHECK (translation_status IN ('', 'auto', 'approved', 'skip'));
CREATE INDEX IF NOT EXISTS coupons_translation_auto_idx ON coupons(id) WHERE translation_status = 'auto';
-- their cost has its own line in Costes de IA
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_feature_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_feature_check CHECK (feature IN ('search', 'content', 'style', 'stores', 'translate'));
-- tracking launch gate: other domains a store sells on (comma-separated registrable domains, see storeDomains), so a deep
-- link there keeps its page instead of falling back to the store's home
ALTER TABLE stores ADD COLUMN IF NOT EXISTS alt_domains text NOT NULL DEFAULT '';
-- what a click was: 'go' (Ir a la tienda, redirected through a tracked link), 'copy' (Copiar código) or 'untracked' (sent
-- straight to the store because its link had stopped being tracked); the page path it came from (no query string), and
-- sha256(user agent + day) truncated to dedupe repeats without storing the raw user agent or the IP
ALTER TABLE clicks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'go';
ALTER TABLE clicks DROP CONSTRAINT IF EXISTS clicks_kind_check;
ALTER TABLE clicks ADD CONSTRAINT clicks_kind_check CHECK (kind IN ('go', 'copy', 'untracked'));
ALTER TABLE clicks ADD COLUMN IF NOT EXISTS ref text NOT NULL DEFAULT '';
ALTER TABLE clicks ADD COLUMN IF NOT EXISTS ua_hash text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS clicks_dedupe_idx ON clicks(coupon_id, ua_hash, at);
-- the network sync cron: when each account last synced without error (last_sync_at / last_error say when it last tried)
ALTER TABLE network_accounts ADD COLUMN IF NOT EXISTS last_success_at timestamptz;
`;

// "Borrar todos los datos" in Administración: business data only (reader accounts, votes, comments and their useful marks, saved deals, expiry reports and date alerts go too); panel users, settings and our own network accounts stay
export const WIPE_DATA_SQL = `DELETE FROM network_accounts WHERE client_id IS NOT NULL; TRUNCATE votes, comment_votes, comments, saved_deals, expiry_reports, date_alert_subs, date_alert_sends, readers, clicks, activity, pages, coupons, stores, clients RESTART IDENTITY CASCADE;`;
