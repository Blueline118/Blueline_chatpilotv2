create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','agent','customer')),
  created_at timestamptz default now(),
  primary key (org_id, member_id)
);

create table if not exists public.invites (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','agent','customer')),
  created_at timestamptz default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  body jsonb,
  created_at timestamptz default now()
);

-- geen RLS of policies hier, alleen schema
