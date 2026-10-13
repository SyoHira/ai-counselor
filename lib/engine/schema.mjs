export const SCHEMA = `
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id serial primary key,
  network text not null,                 -- rakuten | amazon
  external_id text not null,             -- itemCode / ASIN
  name text not null,
  price integer not null default 0,
  url text not null default '',          -- アフィリエイトURL
  category text not null default '',
  genre_id text not null default '',
  commission_rate real not null default 0,
  review_count integer not null default 0,
  review_avg real not null default 0,
  pain text not null default '',
  experienced boolean not null default false,
  tracking_id text not null default '',  -- Amazon のトラッキングID
  status text not null default 'candidate', -- candidate | active | retired
  prior_score real not null default 0,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  unique (network, external_id)
);

create table if not exists rank_snapshots (
  id serial primary key,
  network text not null,
  external_id text not null,
  genre_id text not null default '',
  rank integer not null,
  price integer not null default 0,
  review_count integer not null default 0,
  captured_at timestamptz not null default now()
);
create index if not exists rank_snapshots_item on rank_snapshots (network, external_id, captured_at);

create table if not exists pains (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  text text not null,
  scene text not null default '',
  intensity integer not null default 3,
  used_count integer not null default 0
);

create table if not exists posts (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  pain_id integer references pains(id) on delete set null,
  hook_type text not null default '',
  text text not null,
  status text not null default 'draft', -- draft | approved | flagged | scheduled | published | failed | rejected
  compliance jsonb not null default '{}',
  slot_at timestamptz,
  link_slug text unique,
  threads_media_id text,
  threads_reply_id text,
  error text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists posts_status_slot on posts (status, slot_at);

create table if not exists clicks (
  id bigserial primary key,
  slug text not null,
  post_id integer,
  product_id integer,
  visitor text not null default '',
  referer text not null default '',
  ts timestamptz not null default now()
);
create index if not exists clicks_post on clicks (post_id);

create table if not exists post_metrics (
  post_id integer primary key references posts(id) on delete cascade,
  views integer not null default 0,
  likes integer not null default 0,
  replies integer not null default 0,
  reposts integer not null default 0,
  quotes integer not null default 0,
  shares integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists conversions (
  id serial primary key,
  network text not null,
  period_start date not null,
  period_end date not null,
  key text not null,                     -- itemCode / ASIN / トラッキングID
  product_id integer,
  clicks integer not null default 0,
  orders integer not null default 0,
  revenue integer not null default 0,
  commission integer not null default 0,
  unique (network, period_start, period_end, key)
);

create table if not exists job_runs (
  id serial primary key,
  job text not null,
  status text not null,
  summary jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
`;
