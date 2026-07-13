create table if not exists public.anchors_catalog (
  id text primary key,
  name text not null,
  domain text not null,
  network text not null default 'mainnet' check (network in ('mainnet', 'testnet')),
  country text not null,
  currency text not null,
  type text not null check (type in ('on-ramp', 'off-ramp')),
  active boolean not null default true,
  sep24 boolean not null default false,
  sep6 boolean not null default false,
  sep31 boolean not null default false,
  sep10 boolean not null default false,
  operational boolean not null default false,
  fee_fixed numeric,
  fee_percent numeric,
  fee_source text not null default 'default',
  transfer_server_sep24 text,
  transfer_server_sep6 text,
  web_auth_endpoint text,
  direct_payment_server text,
  kyc_server text,
  last_checked_at timestamptz,
  diagnostics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anchors_catalog_country_idx
  on public.anchors_catalog (country);

create index if not exists anchors_catalog_network_idx
  on public.anchors_catalog (network);

create index if not exists anchors_catalog_type_idx
  on public.anchors_catalog (type);

create index if not exists anchors_catalog_active_idx
  on public.anchors_catalog (active);

create index if not exists anchors_catalog_operational_idx
  on public.anchors_catalog (operational);

create index if not exists anchors_catalog_last_checked_idx
  on public.anchors_catalog (last_checked_at);

create table if not exists public.anchor_callback_events (
  transaction_id text not null,
  callback_token text not null,
  status text,
  stellar_tx_hash text,
  external_transaction_id text,
  source_anchor text,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (transaction_id, callback_token)
);

create index if not exists idx_anchor_callback_events_tx_hash
  on public.anchor_callback_events (stellar_tx_hash);

create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  network text not null check (network in ('mainnet', 'testnet')),
  recipient_account text not null,
  recipient_label text,
  asset_code text not null,
  asset_issuer text,
  amount numeric(20, 7) not null check (amount > 0),
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'cancelled', 'failed')),
  expires_at timestamptz,
  paid_at timestamptz,
  payer_account text,
  stellar_tx_hash text,
  manage_token_hash text not null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_links_status_idx on public.payment_links (status);
create index if not exists payment_links_recipient_idx on public.payment_links (recipient_account, created_at desc);
create unique index if not exists payment_links_tx_hash_idx on public.payment_links (stellar_tx_hash) where stellar_tx_hash is not null;
alter table public.payment_links enable row level security;
revoke all on table public.payment_links from anon, authenticated;
