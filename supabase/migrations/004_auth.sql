-- Multi-user auth via Telegram OTP
-- Each user has a Telegram chat ID where their login codes are sent.

create extension if not exists "pgcrypto";

create table if not exists public.auth_users (
  id                uuid primary key default gen_random_uuid(),
  username          text not null unique,
  display_name      text,
  telegram_chat_id  text not null,
  is_active         boolean not null default true,
  is_admin          boolean not null default false,
  created_at        timestamptz not null default now(),
  last_login_at     timestamptz
);

create index if not exists auth_users_username_idx on public.auth_users (lower(username));
create index if not exists auth_users_active_idx   on public.auth_users (is_active);

create table if not exists public.auth_otp_codes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.auth_users(id) on delete cascade,
  code          text not null,           -- 4-digit code as string
  expires_at    timestamptz not null,
  used_at       timestamptz,
  attempt_count int  not null default 0,
  created_at    timestamptz not null default now(),
  ip_address    text,
  user_agent    text
);

create index if not exists auth_otp_codes_user_idx       on public.auth_otp_codes (user_id);
create index if not exists auth_otp_codes_expires_idx    on public.auth_otp_codes (expires_at);
create index if not exists auth_otp_codes_user_used_idx  on public.auth_otp_codes (user_id, used_at);

-- Lock down via RLS; service role on the server bypasses these.
alter table public.auth_users      enable row level security;
alter table public.auth_otp_codes  enable row level security;

-- Seed: insert the project owner so they can log in immediately.
-- The chat ID is the same one already used for signal alerts.
insert into public.auth_users (username, display_name, telegram_chat_id, is_admin)
values ('admin', 'Admin (Golf)', '5398471877', true)
on conflict (username) do nothing;
