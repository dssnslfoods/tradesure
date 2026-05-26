-- 009_telegram_ai_chat.sql
-- Telegram on-demand AI analysis ("ask the bot") feature.
--
-- Conversation state is encoded entirely in inline-keyboard callback_data
-- (symbol + plan + model all fit within Telegram's 64-byte limit), so no
-- state table is needed. This migration only adds the per-contact access
-- flag: admin grants the feature to specific users; admins are always
-- allowed (resolved at request time via auth_users.is_admin).

alter table public.telegram_contacts
  add column if not exists ai_chat_enabled boolean not null default false;

comment on column public.telegram_contacts.ai_chat_enabled is
  'When true, this contact may use the Telegram on-demand AI analysis feature. Admins are always allowed regardless.';
