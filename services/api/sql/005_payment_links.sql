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

create index if not exists payment_links_status_idx
  on public.payment_links (status);

create index if not exists payment_links_recipient_idx
  on public.payment_links (recipient_account, created_at desc);

create unique index if not exists payment_links_tx_hash_idx
  on public.payment_links (stellar_tx_hash)
  where stellar_tx_hash is not null;

alter table public.payment_links enable row level security;

revoke all on table public.payment_links from anon, authenticated;

