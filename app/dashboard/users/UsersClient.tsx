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
import TelegramWebhookPanel from "./TelegramWebhookPanel";
import Icon from "@/components/ui/Icon";

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

function avatarInitials(s: string) {
  return s.slice(0, 1).toUpperCase();
}

export default function UsersClient({
  users,
  contacts,
  currentUserId,
}: {
  users: UserRow[];
  contacts: ContactRow[];
  currentUserId: string;
}) {
  const [pendingContactsOnly, setPendingOnly] = useState(true);
  const [registerOpen, setRegisterOpen] = useState<ContactRow | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const visibleContacts = pendingContactsOnly
    ? contacts.filter((c) => c.registered_user_id === null)
    : contacts;

  return (
    <>
      <TelegramWebhookPanel />

      <section className="mb-7">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="user" size={14} className="text-ink-secondary" />
          <h2 className="text-[15px] font-semibold text-ink-primary">Auth users</h2>
          <span className="text-[11px] text-ink-muted">({users.length})</span>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5 text-[12px]">
              <thead className="bg-surface-2/40 text-left">
                <tr>
                  {["Username","Display name","Chat ID","Created","Last login","Active","Admin"].map(h => (
                    <th key={h} className="px-4 py-3 eyebrow !text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                      ยังไม่มี user
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <UserRowItem
                    key={u.id}
                    u={u}
                    isMe={u.id === currentUserId}
                    onError={(text) => setToast({ tone: "error", text })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="telegram" size={14} className="text-sig-info" />
            <h2 className="text-[15px] font-semibold text-ink-primary">Telegram contacts</h2>
            <span className="text-[11px] text-ink-muted">
              ({visibleContacts.length}
              {pendingContactsOnly ? ` / ${contacts.length}` : ""})
            </span>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-ink-secondary">
            <input
              type="checkbox"
              checked={pendingContactsOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-brand"
            />
            แสดงเฉพาะที่ยังไม่ได้สร้าง user
          </label>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5 text-[12px]">
              <thead className="bg-surface-2/40 text-left">
                <tr>
                  {["Name","Username","Chat ID","Last message","Msgs","Last seen","Status","Actions"].map(h => (
                    <th key={h} className="px-4 py-3 eyebrow !text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleContacts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-sig-buy/15 text-sig-buy">
                        <Icon name="circle-check" size={18} />
                      </span>
                      <div className="text-[13px] text-ink-secondary">
                        {pendingContactsOnly
                          ? "ไม่มี contact ที่ค้างอยู่"
                          : "ยังไม่มีคนส่งข้อความหา bot"}
                      </div>
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

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md">
          <div
            className={`flex items-start gap-3 rounded-card border px-4 py-3 shadow-card ${
              toast.tone === "success"
                ? "border-sig-buy/40 bg-sig-buy/15 text-sig-buy"
                : "border-sig-sell/40 bg-sig-sell/15 text-sig-sell"
            }`}
          >
            <Icon
              name={toast.tone === "success" ? "circle-check" : "alert-triangle"}
              size={16}
              className="mt-0.5"
            />
            <span className="flex-1 text-[13px]">{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Close">
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function UserRowItem({
  u,
  isMe,
  onError,
}: {
  u: UserRow;
  isMe: boolean;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onToggleActive = () => {
    if (isMe && u.is_active) {
      onError("ไม่สามารถ deactivate ตัวเองได้");
      return;
    }
    startTransition(async () => {
      const res = await setUserActive(u.id, !u.is_active);
      if (!res.ok) onError(res.error ?? "failed");
      else router.refresh();
    });
  };
  const onToggleAdmin = () => {
    startTransition(async () => {
      const res = await setUserAdmin(u.id, !u.is_admin);
      if (!res.ok) onError(res.error ?? "failed");
      else router.refresh();
    });
  };

  return (
    <tr className={`hover:bg-surface-2/30 ${isMe ? "bg-sig-info/[0.04]" : ""}`}>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              background: "linear-gradient(135deg, var(--accent-hi), var(--accent-lo))",
              color: "#001b14",
            }}
          >
            {avatarInitials(u.username)}
          </span>
          <div>
            <div className="font-semibold text-ink-primary">{u.username}</div>
            {isMe && (
              <span className="rounded bg-sig-info/15 px-1 py-px text-[9px] font-bold uppercase tracking-eyebrow text-sig-info">
                you
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
        {u.display_name ?? "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-ink-muted">
        {u.telegram_chat_id}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-ink-muted">
        {fmtTime(u.created_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-ink-muted">
        {fmtTime(u.last_login_at)}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onToggleActive}
          disabled={pending || (isMe && u.is_active)}
          title={isMe && u.is_active ? "ไม่สามารถ deactivate ตัวเองได้" : undefined}
          className={`chip !text-[10px] disabled:cursor-not-allowed disabled:opacity-50 ${
            u.is_active ? "chip-buy" : "chip-mute"
          }`}
        >
          <Icon name={u.is_active ? "circle-check" : "circle-x"} size={11} />
          {u.is_active ? "active" : "disabled"}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={onToggleAdmin}
          disabled={pending}
          className={`chip !text-[10px] ${
            u.is_admin ? "chip-warn" : "chip-mute"
          }`}
        >
          <Icon name={u.is_admin ? "shield-check" : "user"} size={11} />
          {u.is_admin ? "admin" : "user"}
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
    <tr className="hover:bg-surface-2/30">
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              background: "linear-gradient(135deg, var(--info), var(--violet))",
              color: "#001b14",
            }}
          >
            {avatarInitials(contactDisplayName(c))}
          </span>
          <span className="font-semibold text-ink-primary">{contactDisplayName(c)}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-ink-secondary">
        {c.username ? `@${c.username}` : "-"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-ink-muted">{c.chat_id}</td>
      <td className="max-w-xs truncate px-4 py-3 text-[11px] text-ink-muted" title={c.last_message_text ?? ""}>
        {c.last_message_text ?? "-"}
      </td>
      <td className="px-4 py-3 text-center tabular text-ink-secondary">{c.message_count}</td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-ink-muted">{fmtTime(c.last_seen_at)}</td>
      <td className="px-4 py-3">
        {c.registered_user_id ? (
          <span className="chip chip-buy !text-[10px]">
            <Icon name="circle-check" size={11} />
            registered
          </span>
        ) : (
          <span className="chip chip-warn !text-[10px]">
            <Icon name="clock" size={11} />
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
              className="btn !bg-sig-buy/15 !text-sig-buy !border-sig-buy/30 hover:!bg-sig-buy/25 !py-1 !px-2 !text-[11px] disabled:opacity-40"
            >
              <Icon name="user-plus" size={11} />
              Create user
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="flex h-7 w-7 items-center justify-center rounded border border-sig-sell/30 bg-sig-sell/10 text-sig-sell transition hover:bg-sig-sell/20 disabled:opacity-40"
            aria-label="Delete contact"
          >
            <Icon name="trash" size={12} />
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

  const suggestUsername =
    contact.username ||
    [contact.first_name, contact.last_name]
      .filter(Boolean)
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") ||
    `user${contact.chat_id.slice(-4)}`;
  const suggestDisplay =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.username ||
    "";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card glass relative w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="eyebrow">Register from contact</div>
            <h2 className="mt-1 text-[18px] font-bold tracking-tightest text-ink-primary">
              Create user
            </h2>
            <p className="mt-1 font-mono text-[11px] text-ink-muted">
              chat:{contact.chat_id}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink-primary">
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              Username <span className="text-sig-sell">*</span>
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={suggestUsername}
              autoFocus
              className="h-10 w-full rounded-chip border border-white/5 bg-surface-2/60 px-3 text-[13px] text-ink-primary placeholder:text-ink-faint focus:border-brand/40"
            />
            <p className="mt-1 text-[10px] text-ink-muted">a-z, A-Z, 0-9, _, -</p>
          </label>
          <label className="block">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              Display name
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={suggestDisplay}
              className="h-10 w-full rounded-chip border border-white/5 bg-surface-2/60 px-3 text-[13px] text-ink-primary placeholder:text-ink-faint focus:border-brand/40"
            />
          </label>
          <label className="flex items-center gap-2 rounded-chip bg-surface-2/40 px-3 py-2.5 text-[13px] text-ink-secondary">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-sig-warn"
            />
            <Icon name="shield-check" size={13} className="text-sig-warn" />
            ให้สิทธิ์ admin (จัดการ users + ทุก feature)
          </label>

          {err && (
            <p className="flex items-start gap-2 rounded-chip border border-sig-sell/30 bg-sig-sell/10 px-3 py-2 text-[11px] text-sig-sell">
              <Icon name="alert-triangle" size={12} className="mt-0.5" />
              {err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={pending} className="btn btn-ghost">
              ยกเลิก
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              <Icon name="user-plus" size={14} />
              {pending ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
