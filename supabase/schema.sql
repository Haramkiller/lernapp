-- Lernapp-Schema für Supabase (Postgres). Idempotent ausführbar im SQL-Editor.
-- Jede Tabelle gehört einem Nutzer (user_id = auth.uid()); RLS lässt nur eigene Zeilen zu.

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  exam_date date,
  style_profile text,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  module_id uuid not null references public.modules on delete cascade,
  name text not null,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  module_id uuid not null references public.modules on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  type text not null check (type in ('choice', 'cloze', 'matching', 'order', 'free')),
  payload jsonb not null,
  explanation text not null default '',
  source jsonb,
  exam_relevant boolean not null default false,
  from_exam boolean not null default false,
  difficulty int not null default 1 check (difficulty between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.card_states (
  card_id uuid primary key references public.cards on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default clock_timestamp()
);

-- id wird vom Client erzeugt (uuid), damit Wiederholungsversuche per Upsert idempotent sind.
create table if not exists public.review_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null references public.cards on delete cascade,
  rating int not null check (rating between 1 and 4),
  reviewed_at timestamptz not null,
  study_day text not null,
  elapsed_days real not null default 0
);

-- Stufe 1b, Teil 2: echte Spielentscheidungen und Funde (gewähltes Gebiet je Modul, letzter Kampf, …).
-- id vergibt der Client (z. B. 'area:<modul-id>', 'rest'); eindeutig je Nutzer.
create table if not exists public.game_items (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- Pull-Cursor der Clients: synced_at (Serverzeit), Keyset-Paginierung über (synced_at, Schlüssel).
create index if not exists modules_user_synced_idx on public.modules (user_id, synced_at, id);
create index if not exists topics_user_synced_idx on public.topics (user_id, synced_at, id);
create index if not exists cards_user_synced_idx on public.cards (user_id, synced_at, id);
create index if not exists card_states_user_synced_idx on public.card_states (user_id, synced_at, card_id);
create index if not exists game_items_user_synced_idx on public.game_items (user_id, synced_at, id);
create index if not exists review_logs_user_reviewed_idx on public.review_logs (user_id, reviewed_at);
create index if not exists review_logs_card_idx on public.review_logs (card_id);
create index if not exists topics_module_idx on public.topics (module_id);
create index if not exists cards_module_idx on public.cards (module_id);
create index if not exists cards_topic_idx on public.cards (topic_id);

-- Last-write-wins: updated_at ist die logische (Client-)Zeit; synced_at wird immer vom Server
-- gesetzt (nie vom Client), damit Pull-Cursor auch spät hochgeladene, alte Änderungen sehen.
create or replace function public.set_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end
$$;

-- Ältere oder gleich alte Updates sind ein No-Op (OLD bleibt, synced_at wird nicht angehoben).
create or replace function public.lww_guard() returns trigger
language plpgsql as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['modules', 'topics', 'cards', 'card_states', 'game_items'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_synced_insert', t);
    execute format('drop trigger if exists %I on public.%I', t || '_lww_update', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.set_synced_at()',
      t || '_synced_insert', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.lww_guard()',
      t || '_lww_update', t);
  end loop;
end
$$;

-- Teil 5b: Einschätzung vor dem Aufdecken. Nullbar, damit alte Einträge und alte App-Versionen gültig bleiben.
-- synced_at (Serverzeit) erlaubt den Geräten, Logs mit Einschätzung zurückzuholen.
alter table public.review_logs
  add column if not exists confidence text check (confidence in ('sure', 'unsure')),
  add column if not exists outcome text check (outcome in ('right', 'partial', 'wrong')),
  add column if not exists synced_at timestamptz not null default clock_timestamp();
create index if not exists review_logs_user_synced_idx on public.review_logs (user_id, synced_at, id);
drop trigger if exists review_logs_synced_insert on public.review_logs;
create trigger review_logs_synced_insert before insert on public.review_logs
  for each row execute function public.set_synced_at();

-- Row Level Security: je Tabelle und Operation eine Policy (nur eigene Zeilen).
alter table public.modules enable row level security;
alter table public.topics enable row level security;
alter table public.cards enable row level security;
alter table public.card_states enable row level security;
alter table public.review_logs enable row level security;
alter table public.game_items enable row level security;

-- Tabellenrechte: Neuere Supabase-Projekte vergeben sie für neue Tabellen nicht mehr automatisch.
-- Nur angemeldete Nutzer (authenticated), nie anon; welche Zeilen, regeln die Policies unten.
grant select, insert, update, delete on public.modules, public.topics, public.cards, public.card_states, public.review_logs, public.game_items to authenticated;

-- (select auth.uid()) statt auth.uid(): Postgres wertet es einmal pro Abfrage aus, nicht pro Zeile (Supabase-Empfehlung).
do $$
declare
  t text;
begin
  foreach t in array array['modules', 'topics', 'cards', 'card_states', 'review_logs', 'game_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      t || '_delete_own', t);
  end loop;
end
$$;

-- Einmal-Tickets für „Nachfragen“ über die Werkstatt am PC.
-- Die App schickt der Werkstatt nicht mehr ihr Zugriffstoken (das gälte für die ganze API),
-- sondern nur eine Zufallszahl (nonce), die sie vorher als Ticket angelegt hat. Die Werkstatt löst
-- sie über redeem_ask_ticket ein: gültig nur einmal und nur 60 Sekunden. Ein fremdes Programm,
-- das sich als Werkstatt ausgibt, bekommt so nichts, womit es auf Daten zugreifen könnte.
create table if not exists public.ask_tickets (
  nonce text primary key check (nonce ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ask_tickets_created_at on public.ask_tickets (created_at);

-- Den Zeitpunkt setzt immer die Datenbank, nie der Client (sonst ließen sich langlebige Tickets anlegen).
create or replace function public.ask_tickets_set_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end
$$;

drop trigger if exists ask_tickets_created_at on public.ask_tickets;
create trigger ask_tickets_created_at before insert on public.ask_tickets
  for each row execute function public.ask_tickets_set_created_at();

alter table public.ask_tickets enable row level security;
drop policy if exists ask_tickets_insert_own on public.ask_tickets;
create policy ask_tickets_insert_own on public.ask_tickets
  for insert to authenticated with check ((select auth.uid()) = user_id);
grant insert on public.ask_tickets to authenticated;
-- Keine select/update/delete-Policies: Tickets liest und löscht nur redeem_ask_ticket.

create or replace function public.redeem_ask_ticket(p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_one boolean;
begin
  -- Aufräumen: alte, nie eingelöste Tickets.
  delete from public.ask_tickets where created_at < now() - interval '1 hour';
  delete from public.ask_tickets
    where nonce = p_nonce
      and created_at > now() - interval '60 seconds'
    returning true into found_one;
  return coalesce(found_one, false);
end
$$;

revoke all on function public.redeem_ask_ticket(text) from public;
grant execute on function public.redeem_ask_ticket(text) to anon, authenticated;
