-- Captures Telegram chat IDs of anyone who messages the bot, so an admin
-- can convert them into auth_users without having to dig through getUpdates.

create table if not exists public.telegram_contacts (
  id                 uuid primary key default gen_random_uuid(),
  chat_id            text not null unique,
  username           text,
  first_name         text,
  last_name          text,
  language_code      text,
  is_bot             boolean not null default false,
  last_message_text  text,
  message_count      int not null default 1,
  registered_user_id uuid references public.auth_users(id) on delete set null,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);

create index if not exists telegram_contacts_chat_id_idx on public.telegram_contacts (chat_id);
create index if not exists telegram_contacts_unregistered_idx
  on public.telegram_contacts (registered_user_id) where registered_user_id is null;

alter table public.telegram_contacts enable row level security;
