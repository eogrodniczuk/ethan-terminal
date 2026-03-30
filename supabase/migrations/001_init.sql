create extension if not exists "pgcrypto";

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null default 0,
  type text not null check (type in ('Equity','ETF','Option','Cash')),
  ticker text,
  display text not null,
  shares numeric not null default 0,
  avg_purchase_price numeric not null default 0,
  cash_value numeric not null default 0,
  currency text not null default 'USD' check (currency in ('CAD','USD')),
  contract_multiplier numeric not null default 1,
  beta numeric,
  current_price_override numeric,
  delta numeric,
  beta_override numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  story_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.positions enable row level security;
alter table public.user_settings enable row level security;

create policy "users can read own positions" on public.positions for select using (auth.uid() = user_id);
create policy "users can insert own positions" on public.positions for insert with check (auth.uid() = user_id);
create policy "users can update own positions" on public.positions for update using (auth.uid() = user_id);
create policy "users can delete own positions" on public.positions for delete using (auth.uid() = user_id);

create policy "users can read own settings" on public.user_settings for select using (auth.uid() = user_id);
create policy "users can insert own settings" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "users can update own settings" on public.user_settings for update using (auth.uid() = user_id);

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger positions_updated_at before update on public.positions
for each row execute procedure public.handle_updated_at();

create trigger user_settings_updated_at before update on public.user_settings
for each row execute procedure public.handle_updated_at();
