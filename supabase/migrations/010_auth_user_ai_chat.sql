-- 010_auth_user_ai_chat.sql
-- Move the AI-chat access flag to where registered users are actually managed.
--
-- Phase A/B stored ai_chat_enabled only on telegram_contacts. But once a
-- contact is converted to an auth_user, admins manage them from the Auth
-- users table — and the contacts table filters registered ones out. So we
-- add the flag to auth_users too. The bot access check now resolves in this
-- order: admin (always) → auth_users.ai_chat_enabled → telegram_contacts
-- .ai_chat_enabled (fallback for not-yet-registered contacts).

alter table public.auth_users
  add column if not exists ai_chat_enabled boolean not null default false;

comment on column public.auth_users.ai_chat_enabled is
  'When true, this user may use the Telegram on-demand AI analysis feature. Admins are always allowed regardless.';
