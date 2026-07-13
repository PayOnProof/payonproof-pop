alter table public.payment_links
  add column if not exists origin_country text,
  add column if not exists origin_anchor_id text,
  add column if not exists origin_anchor_name text,
  add column if not exists route_snapshot jsonb,
  add column if not exists quoted_at timestamptz;

create index if not exists payment_links_origin_anchor_idx
  on public.payment_links (origin_anchor_id, status);
