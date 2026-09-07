-- Schema for the skill store. Run once in the Supabase SQL editor.

create table if not exists public.skills (
  name        text primary key,
  description text        not null default '',
  body        text        not null,
  updated_at  timestamptz not null default now()
);

-- Keep updated_at honest on re-seed.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists skills_touch_updated_at on public.skills;
create trigger skills_touch_updated_at
  before update on public.skills
  for each row execute function public.touch_updated_at();

-- Skills are public instructions, so anonymous reads are allowed and writes
-- are not. The server uses the anon key; the seed script uses the service role
-- key, which bypasses these policies.
alter table public.skills enable row level security;

drop policy if exists "skills are publicly readable" on public.skills;
create policy "skills are publicly readable"
  on public.skills for select
  to anon, authenticated
  using (true);
