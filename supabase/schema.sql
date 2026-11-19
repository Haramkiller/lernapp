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

-- Pull-Cursor der Clients: synced_at (Serverzeit), Keyset-Paginierung über (synced_at, Schlüssel).
create index if not exists modules_user_synced_idx on public.modules (user_id, synced_at, id);
create index if not exists topics_user_synced_idx on public.topics (user_id, synced_at, id);
create index if not exists cards_user_synced_idx on public.cards (user_id, synced_at, id);
create index if not exists card_states_user_synced_idx on public.card_states (user_id, synced_at, card_id);
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
  foreach t in array array['modules', 'topics', 'cards', 'card_states'] loop
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

-- Row Level Security: je Tabelle und Operation eine Policy (nur eigene Zeilen).
alter table public.modules enable row level security;
alter table public.topics enable row level security;
alter table public.cards enable row level security;
alter table public.card_states enable row level security;
alter table public.review_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['modules', 'topics', 'cards', 'card_states', 'review_logs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)',
      t || '_delete_own', t);
  end loop;
end
$$;
