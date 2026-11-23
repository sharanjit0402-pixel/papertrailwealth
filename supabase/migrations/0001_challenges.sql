-- The Paper Trail: money challenges
-- Run once in Supabase > SQL Editor.

-- People who signed in (one row per auth user, created automatically)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  email_opt_in boolean not null default true,
  created_at timestamptz not null default now()
);

-- Which challenges each person joined
create table if not exists public.enrollments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null check (challenge in ('52-week','emergency-fund','savings-streak')),
  settings jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  unique (user_id, challenge)
);

-- Every check-in / deposit / withdrawal
create table if not exists public.logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null check (challenge in ('52-week','emergency-fund','savings-streak')),
  ref text not null,                       -- 'w12' (week), '2026-12-01' (day) or a unique id (deposit)
  kind text not null check (kind in ('week','day','save','withdraw')),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, challenge, ref)
);
create index if not exists logs_user_challenge on public.logs (user_id, challenge);

-- Emails already sent (so nothing is sent twice)
create table if not exists public.email_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,                       -- e.g. 'welcome:52-week', 'streak-7', 'reminder:2026-12-01'
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Row level security: people can only see and change their own data
alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;
alter table public.logs enable row level security;
alter table public.email_log enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own enrollments" on public.enrollments;
create policy "own enrollments" on public.enrollments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own logs" on public.logs;
create policy "own logs" on public.logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- email_log: no policies = only the server (service role) can touch it

-- Create a profile automatically when someone signs in for the first time
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, email_opt_in)
  values (
    new.id, new.email,
    nullif(new.raw_user_meta_data->>'name', ''),
    coalesce((new.raw_user_meta_data->>'email_opt_in')::boolean, true)
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Handy view for you: one row per person per challenge
create or replace view public.challenge_dashboard with (security_invoker = true) as
select p.name, p.email, p.email_opt_in, e.challenge, e.started_at,
       count(l.id) as check_ins,
       coalesce(sum(case when l.kind = 'withdraw' then -l.amount else l.amount end), 0) as total_saved,
       max(l.created_at) as last_active
from public.profiles p
join public.enrollments e on e.user_id = p.id
left join public.logs l on l.user_id = p.id and l.challenge = e.challenge
group by p.name, p.email, p.email_opt_in, e.challenge, e.started_at
order by e.started_at desc;
