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

-- 高単価案件（ASP）。リサーチで発見 → 人が提携申請 → アフィリURLを入れて有効化 → products に載る
create table if not exists offers (
  id serial primary key,
  asp text not null default '',
  program text not null,
  advertiser text not null default '',
  category text not null default '',
  reward_yen integer not null default 0,
  reward_note text not null default '',
  condition text not null default '',
  approval_rate real,
  sns_allowed boolean,
  restrictions text not null default '',
  fit integer not null default 3,
  pain text not null default '',
  risk_notes text not null default '',
  sources jsonb not null default '[]',
  expected_value real not null default 0,
  affiliate_url text not null default '',
  status text not null default 'discovered', -- discovered | applied | active | rejected | ended
  product_id integer,
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (asp, program)
);

-- 配信チャネル: threads（SNS可の商品）/ guide（自社ガイドページ。SNS不可のASP案件もここだけに載る）
alter table products add column if not exists channels text not null default 'threads,guide';
alter table products add column if not exists segment text not null default '';
alter table offers add column if not exists segment text not null default '';

-- LINE公式アカウントの友だち
create table if not exists line_users (
  user_id text primary key,
  segment text not null default '',
  step integer not null default 0,
  followed_at timestamptz not null default now(),
  last_pushed_at timestamptz,
  blocked boolean not null default false,
  ai_count_date date,
  ai_count integer not null default 0
);

-- ステップ配信の本文（セグメント × 何通目）。生成 → 判定 → 承認 されたものだけ送る
create table if not exists line_steps (
  id serial primary key,
  segment text not null,
  step integer not null,
  day_offset integer not null,
  text text not null,
  guide_slug text not null default '',
  status text not null default 'draft', -- draft | approved | flagged
  compliance jsonb not null default '{}',
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (segment, step)
);

-- 自社ガイドページ（悩み別）。LINE・Threads のリンク先で、AI検索・検索流入の受け皿
create table if not exists guides (
  slug text primary key,
  segment text not null,
  title text not null,
  description text not null default '',
  body jsonb not null default '{}',
  status text not null default 'draft', -- draft | published | flagged
  compliance jsonb not null default '{}',
  views integer not null default 0,
  updated_at timestamptz not null default now()
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
