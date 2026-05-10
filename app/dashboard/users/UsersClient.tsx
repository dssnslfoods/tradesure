"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createUserFromContact,
  deleteContact,
  setUserActive,
  setUserAdmin,
} from "./actions";
import type { UserRow, ContactRow } from "./page";

function fmtTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-GB", { hour12: false });
}

function contactDisplayName(c: ContactRow) {
  return (
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.username ||
    `chat:${c.chat_id}`
  );
}

export default function UsersClient({
  users,
  contacts,
}: {
  users: UserRow[];
  contacts: ContactRow[];
}) {
  const [pendingContactsOnly, setPendingOnly] = useState(true);
  const [registerOpen, setRegisterOpen] = useState<ContactRow | null>(null);

  const visibleContacts = pendingContactsOnly
    ? contacts.filter((c) => c.registered_user_id === null)
    : contacts;

  return (
    <>
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Auth users ({users.length})</h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-crypto-border text-sm">
              <thead className="bg-black/30 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Display name</th>
                  <th className="px-4 py-3">Chat ID</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Last login</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-crypto-border">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      ยังไม่มี user
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <UserRowItem key={u.id} u={u} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Telegram contacts ({visibleContacts.length}
            {pendingContactsOnly ? ` / ${contacts.length}` : ""})
          </h2>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={pendingContactsOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-emerald-500"
            />
            แสดงเฉพาะที่ยังไม่ได้สร้าง user
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-crypto-border text-sm">
              <thead className="bg-black/30 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Telegram username</th>
                  <th className="px-4 py-3">Chat ID</th>
                  <th className="px-4 py-3">Last message</th>
                  <th className="px-4 py-3">Msgs</th>
                  <th className="px-4 py-3">First seen</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-crypto-border">
                {visibleContacts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      {pendingContactsOnly
                        ? "ไม่มี contact ที่ค้างอยู่ — ทุกคนถูกสร้างเป็น user แล้ว"
                        : "ยังไม่มีคนส่งข้อความหา bot"}
                    </td>
                  </tr>
                )}
                {visibleContacts.map((c) => (
                  <ContactRowItem
                    key={c.id}
                    c={c}
                    onRegister={() => setRegisterOpen(c)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <RegisterModal
        contact={registerOpen}
        onClose={() => setRegisterOpen(null)}
      />
    </>
  );
}

function UserRowItem({ u }: { u: UserRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onToggleActive = () => {
    startTransition(async () => {
      await setUserActive(u.id, !u.is_active);
      router.refresh();
    });
  };
  const onToggleAdmin = () => {
    startTransition(async () => {
      await setUserAdmin(u.id, !u.is_admin);
      router.refresh();
    });
  };

  return (
    <tr className="hover:bg-black/20">
      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-100">
        {u.username}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-300">
        {u.display_name ?? "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">
        {u.telegram_chat_id}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
        {fmtTime(u.created_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
        {fmtTime(u.last_login_at)}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onToggleActive}
          disabled={pending}
          className={`rounded px-2 py-0.5 text-xs font-semibold disabled:opacity-40 ${
            u.is_active
              ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
              : "bg-slate-500/20 text-slate-400 hover:bg-slate-500/30"
          }`}
        >
          {u.is_active ? "✓ active" : "○ disabled"}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onToggleAdmin}
          disabled={pending}
          className={`rounded px-2 py-0.5 text-xs font-semibold disabled:opacity-40 ${
            u.is_admin
              ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
              : "bg-slate-500/20 text-slate-400 hover:bg-slate-500/30"
          }`}
        >
          {u.is_admin ? "★ admin" : "user"}
        </button>
      </td>
    </tr>
  );
}

function ContactRowItem({
  c,
  onRegister,
}: {
  c: ContactRow;
  onRegister: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (!confirm(`ลบ contact "${contactDisplayName(c)}"?`)) return;
    startTransition(async () => {
      await deleteContact(c.id);
      router.refresh();
    });
  };

  return (
    <tr className="hover:bg-black/20">
      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-100">
        {contactDisplayName(c)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-300">
        {c.username ? `@${c.username}` : "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">
        {c.chat_id}
      </td>
      <td className="max-w-xs truncate px-4 py-3 text-xs text-slate-400" title={c.last_message_text ?? ""}>
        {c.last_message_text ?? "-"}
      </td>
      <td className="px-4 py-3 text-center text-slate-300 tabular-nums">{c.message_count}</td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{fmtTime(c.first_seen_at)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{fmtTime(c.last_seen_at)}</td>
      <td className="px-4 py-3">
        {c.registered_user_id ? (
          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            ✓ registered
          </span>
        ) : (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
            pending
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="inline-flex gap-1">
          {!c.registered_user_id && (
            <button
              type="button"
              onClick={onRegister}
              disabled={pending}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              ➕ Create user
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
            title="Delete contact"
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  );
}

function RegisterModal({
  contact,
  onClose,
}: {
  contact: ContactRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!contact) return null;

  // Suggest username from telegram username on first open
  if (username === "" && contact.username) {
    // run once via render; using state to set means we need useEffect — keep it simple
  }

  const suggestUsername =
    contact.username ||
    [contact.first_name, contact.last_name].filter(Boolean).join("").toLowerCase().replace(/[^a-z0-9_-]/g, "") ||
    `user${contact.chat_id.slice(-4)}`;
  const suggestDisplay =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.username || "";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await createUserFromContact({
        contactId: contact.id,
        username: (username || suggestUsername).trim(),
        displayName: (displayName || suggestDisplay).trim(),
        isAdmin,
      });
      if (!res.ok) {
        setErr(res.error ?? "failed");
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-crypto-border bg-crypto-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">สร้าง user จาก Telegram contact</h2>
            <p className="text-xs text-slate-400">
              {contactDisplayName(contact)} · chat:{contact.chat_id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Username <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={suggestUsername}
              autoFocus
              className="w-full rounded-lg border border-crypto-border bg-black/40 px-3 py-2 text-slate-100 placeholder-slate-600 focus:border-crypto-accent focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              ใช้สำหรับ login (a-z, A-Z, 0-9, _, -)
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={suggestDisplay}
              className="w-full rounded-lg border border-crypto-border bg-black/40 px-3 py-2 text-slate-100 placeholder-slate-600 focus:border-crypto-accent focus:outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-amber-500"
            />
            ★ ให้สิทธิ์ admin (จัดการ users + ทุก feature)
          </label>

          {err && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-crypto-border bg-black/30 px-4 py-2 text-sm text-slate-300 hover:bg-black/50 disabled:opacity-40"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "กำลังสร้าง…" : "✅ สร้าง user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
