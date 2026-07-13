alter table public.payment_links
  add column if not exists destination_country text,
  add column if not exists destination_anchor_id text,
  add column if not exists destination_anchor_name text,
  add column if not exists anchor_transaction_id text,
  add column if not exists anchor_status_ref text;

alter table public.payment_links
  drop constraint if exists payment_links_status_check;

alter table public.payment_links
  add constraint payment_links_status_check
  check (status in ('pending', 'processing', 'paid', 'expired', 'cancelled', 'failed'));

create index if not exists payment_links_destination_anchor_idx
  on public.payment_links (destination_anchor_id, status);

create unique index if not exists payment_links_anchor_transaction_idx
  on public.payment_links (anchor_transaction_id)
  where anchor_transaction_id is not null;
