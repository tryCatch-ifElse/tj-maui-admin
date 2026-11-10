-- TJ & MAUI STUDIO: dashboard business tables
-- Run this in Supabase SQL Editor after the profiles table and auth trigger exist.
-- Clients are business records, NOT Supabase Auth users. One client may have many events.

create extension if not exists pgcrypto;

-- Dashboard accounts are owner/admin/staff only. Client records do not sign in.
alter table public.profiles drop constraint if exists profiles_userlevel_check;
alter table public.profiles
  add constraint profiles_userlevel_check
  check (userlevel in ('owner', 'admin', 'staff'));

create or replace function public.is_active_dashboard_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.userlevel in ('owner', 'admin', 'staff')
  );
$$;

create or replace function public.is_dashboard_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and p.userlevel in ('owner', 'admin')
  );
$$;

grant execute on function public.is_active_dashboard_user() to authenticated;
grant execute on function public.is_dashboard_admin() to authenticated;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code varchar(40) not null unique,
  client_name varchar(150) not null,
  email varchar(150),
  contact_number varchar(30),
  address text,
  client_status varchar(20) not null default 'active'
    check (client_status in ('active', 'inactive', 'archived')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_name on public.clients (lower(client_name));
create index if not exists idx_clients_status on public.clients (client_status);
create index if not exists idx_clients_created_at on public.clients (created_at desc);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_code varchar(40) not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  event_name varchar(150) not null,
  event_type varchar(50) not null default 'Other',
  event_date date,
  venue varchar(255),
  event_status varchar(20) not null default 'inquiry'
    check (event_status in ('inquiry', 'planning', 'confirmed', 'completed', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_events_client_id on public.events (client_id);
create index if not exists idx_events_event_date on public.events (event_date);
create index if not exists idx_events_status on public.events (event_status);
create index if not exists idx_events_created_at on public.events (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.events enable row level security;

drop policy if exists "dashboard users read clients" on public.clients;
create policy "dashboard users read clients"
on public.clients for select to authenticated
using (public.is_active_dashboard_user());

drop policy if exists "dashboard users create clients" on public.clients;
create policy "dashboard users create clients"
on public.clients for insert to authenticated
with check (
  public.is_active_dashboard_user()
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "dashboard users update clients" on public.clients;
create policy "dashboard users update clients"
on public.clients for update to authenticated
using (public.is_active_dashboard_user())
with check (public.is_active_dashboard_user());

drop policy if exists "admins delete clients" on public.clients;
create policy "admins delete clients"
on public.clients for delete to authenticated
using (public.is_dashboard_admin());

drop policy if exists "dashboard users read events" on public.events;
create policy "dashboard users read events"
on public.events for select to authenticated
using (public.is_active_dashboard_user());

drop policy if exists "dashboard users create events" on public.events;
create policy "dashboard users create events"
on public.events for insert to authenticated
with check (
  public.is_active_dashboard_user()
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "dashboard users update events" on public.events;
create policy "dashboard users update events"
on public.events for update to authenticated
using (public.is_active_dashboard_user())
with check (public.is_active_dashboard_user());

drop policy if exists "admins delete events" on public.events;
create policy "admins delete events"
on public.events for delete to authenticated
using (public.is_dashboard_admin());

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.events to authenticated;

-- IMPORTANT:
-- 1. Keep your existing Supabase Auth/profile trigger. It should assign new dashboard
--    accounts the 'staff' role; do not permit public signup as owner/admin.
-- 2. Set your own account to owner manually using your actual email:
--    update public.profiles p
--    set userlevel = 'owner', account_status = 'active'
--    from auth.users u
--    where p.id = u.id and lower(u.email) = lower('YOUR_EMAIL');
-- 3. Staff can read/create/update. Only owner/admin can delete rows.
-- 4. Client users are not created in auth.users and cannot access this dashboard.
