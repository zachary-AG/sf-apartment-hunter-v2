-- Enable UUID generation
create extension if not exists "pgcrypto";

-- listings table
create table listings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  url text not null,
  source text not null default 'unknown',
  title text not null default '',
  address text not null default '',
  neighborhood text,
  lat numeric,
  lng numeric,
  price integer,
  price_confirmed boolean not null default false,
  beds numeric,
  baths numeric,
  sqft integer,
  description text,
  images text[] not null default '{}',
  contact_email text,
  status text not null default 'saved'
    check (status in ('saved','inquiry_sent','price_received','liked','passed')),
  inquiry_email_id text,
  inquiry_sent_at timestamptz,
  price_reply_received_at timestamptz,
  notes text,
  available_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger listings_updated_at
  before update on listings
  for each row execute procedure set_updated_at();

-- email_poll_log table
create table email_poll_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  polled_at timestamptz not null default now(),
  replies_found integer not null default 0,
  listings_updated integer not null default 0
);

-- user_tokens table (Gmail OAuth refresh tokens)
create table user_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  gmail_refresh_token text not null,
  gmail_email text not null,
  created_at timestamptz not null default now()
);

-- user_preferences table
create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  commute_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_updated_at
  before update on user_preferences
  for each row execute procedure set_updated_at();

-- RLS: enable row-level security on all tables
alter table listings enable row level security;
alter table email_poll_log enable row level security;
alter table user_tokens enable row level security;
alter table user_preferences enable row level security;

-- NOTE: Since Clerk JWTs are used (not Supabase Auth), use service role key
-- on the server side to bypass RLS. These policies are a safety net.
create policy "Users own their listings"
  on listings for all using (true) with check (true);
create policy "Users own their poll logs"
  on email_poll_log for all using (true) with check (true);
create policy "Users own their tokens"
  on user_tokens for all using (true) with check (true);
create policy "Users own their preferences"
  on user_preferences for all using (true) with check (true);
