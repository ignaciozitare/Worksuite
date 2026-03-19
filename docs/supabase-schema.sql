-- ═══════════════════════════════════════════════════════════════
-- WorkSuite — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Users (extends Supabase auth.users) ───────────────────
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        text not null default 'user' check (role in ('admin', 'user')),
  desk_type   text not null default 'hotdesk' check (desk_type in ('none', 'hotdesk', 'fixed')),
  avatar      text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, name, email, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    upper(substr(coalesce(new.raw_user_meta_data->>'name', new.email), 1, 2))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. Worklogs ───────────────────────────────────────────────
create table if not exists public.worklogs (
  id               text primary key,
  issue_key        text not null,
  issue_summary    text not null default '',
  issue_type       text not null default 'Task',
  epic_key         text not null default '—',
  epic_name        text not null default '—',
  project_key      text not null default '—',
  author_id        uuid not null references public.users(id) on delete cascade,
  author_name      text not null,
  date             date not null,
  started_at       time not null default '09:00',
  seconds          integer not null check (seconds > 0 and seconds <= 86400),
  description      text not null default '',
  synced_to_jira   boolean not null default false,
  jira_worklog_id  text,
  created_at       timestamptz not null default now()
);

create index if not exists worklogs_author_date on public.worklogs(author_id, date);
create index if not exists worklogs_date on public.worklogs(date);

-- ── 3. Seats ──────────────────────────────────────────────────
create table if not exists public.seats (
  id     text primary key,
  zone   text not null,
  label  text not null,
  x      integer not null,
  y      integer not null
);

-- Seed default seats (18 seats, 3 zones)
insert into public.seats (id, zone, label, x, y) values
  ('A1','A','A1', 72, 78), ('A2','A','A2',104, 78), ('A3','A','A3',136, 78),
  ('A4','A','A4', 72,112), ('A5','A','A5',104,112), ('A6','A','A6',136,112),
  ('B1','B','B1',259, 78), ('B2','B','B2',291, 78), ('B3','B','B3',323, 78),
  ('B4','B','B4',259,112), ('B5','B','B5',291,112), ('B6','B','B6',323,112),
  ('C1','C','C1', 72,278), ('C2','C','C2',113,278), ('C3','C','C3',154,278),
  ('C4','C','C4',226,278), ('C5','C','C5',267,278), ('C6','C','C6',308,278)
on conflict (id) do nothing;

-- ── 4. Seat reservations ──────────────────────────────────────
create table if not exists public.seat_reservations (
  id          text primary key,
  seat_id     text not null references public.seats(id),
  user_id     uuid not null references public.users(id) on delete cascade,
  user_name   text not null,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique(seat_id, date)
);

create index if not exists reservations_date on public.seat_reservations(date);

-- ── 5. Fixed assignments ──────────────────────────────────────
create table if not exists public.fixed_assignments (
  seat_id    text primary key references public.seats(id),
  user_id    uuid not null references public.users(id) on delete cascade,
  user_name  text not null
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

alter table public.users             enable row level security;
alter table public.worklogs          enable row level security;
alter table public.seats             enable row level security;
alter table public.seat_reservations enable row level security;
alter table public.fixed_assignments enable row level security;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ── Users ─────────────────────────────────────────────────────
create policy "users_read_all"  on public.users for select using (true);
create policy "users_edit_own"  on public.users for update using (id = auth.uid());
create policy "admins_edit_all" on public.users for update using (public.is_admin());

-- ── Worklogs ──────────────────────────────────────────────────
-- FIX: eliminada la policy "admins_all_worklogs" que era un duplicado.
-- "worklogs_own" ya cubre admins con el or public.is_admin().
-- Tener dos policies para el mismo rol+acción no añade seguridad,
-- solo confunde las auditorías y puede generar conflictos futuros.
create policy "worklogs_own"
  on public.worklogs for select
  using (author_id = auth.uid() or public.is_admin());

create policy "worklogs_insert_own"
  on public.worklogs for insert
  with check (author_id = auth.uid());

create policy "worklogs_delete_own"
  on public.worklogs for delete
  using (author_id = auth.uid() or public.is_admin());

-- ── Seats ─────────────────────────────────────────────────────
create policy "seats_read_all"    on public.seats for select using (true);
create policy "seats_admin_write" on public.seats for all    using (public.is_admin());

-- ── Reservations ──────────────────────────────────────────────
create policy "res_read_all"   on public.seat_reservations for select using (true);
create policy "res_insert_own" on public.seat_reservations for insert with check (user_id = auth.uid());
create policy "res_delete_own" on public.seat_reservations for delete using (user_id = auth.uid() or public.is_admin());

-- ── Fixed assignments ─────────────────────────────────────────
create policy "fixed_read_all"    on public.fixed_assignments for select using (true);
create policy "fixed_admin_write" on public.fixed_assignments for all    using (public.is_admin());
