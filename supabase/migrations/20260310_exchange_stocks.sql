create table if not exists public.exchange_stocks (
  ticker text primary key,
  name text not null,
  exchange text not null,          -- 'XSTO', 'NYSE', 'NASDAQ' etc.
  segment text,                    -- 'Large Cap', 'Mid Cap', 'Small Cap'
  updated_at timestamptz default now()
);

alter table public.exchange_stocks enable row level security;

-- All authenticated users can read
create policy "Anyone can read exchange stocks"
  on public.exchange_stocks for select
  to authenticated
  using (true);
