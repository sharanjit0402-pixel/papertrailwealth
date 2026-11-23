-- The Paper Trail: Weekly Investing Newsletter
-- Run once in Supabase > SQL Editor.

create table if not exists public.newsletter_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text,
  status text not null default 'active' check (status in ('active','unsubscribed')),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

-- One row per issue we email out (so an issue is never sent twice)
create table if not exists public.newsletter_sends (
  slug text primary key,
  subject text not null,
  recipients int not null default 0,
  sent_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_sends enable row level security;

-- Visitors can only ADD their email (they can't read or change the list)
drop policy if exists "anyone can subscribe" on public.newsletter_subscribers;
create policy "anyone can subscribe" on public.newsletter_subscribers
  for insert to anon, authenticated with check (status = 'active');
-- newsletter_sends: no policies = only the server (service role) can touch it

-- Handy view for you: subscriber counts
create or replace view public.newsletter_dashboard with (security_invoker = true) as
select status, count(*) as people, max(created_at) as latest_signup
from public.newsletter_subscribers group by status;
