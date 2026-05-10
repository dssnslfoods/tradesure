// Edge-safe session helpers (Web Crypto API only — no node:crypto).
// Used by middleware (Edge runtime) and Node API routes alike.

export const SESSION_COOKIE = "ts_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24; // 1 day

export interface SessionPayload {
  uid: string; // user id
  un: string;  // username
  exp: number; // unix seconds
}

function getSecret(): string {
  const s = process.env.AUTH_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SESSION_SECRET env var must be set to a string ≥ 16 chars"
    );
  }
  return s;
}

function bufToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bufToB64url(sig);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  userId: string,
  username: string
): Promise<{ token: string; expiresAt: Date }> {
  const expSec = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload: SessionPayload = { uid: userId, un: username, exp: expSec };
  const payloadB64 = bufToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt: new Date(expSec * 1000),
  };
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let expectedSig: string;
  try {
    expectedSig = await hmacSign(payloadB64);
  } catch {
    return null;
  }
  if (!timingSafeEqualStr(sig, expectedSig)) return null;

  let payload: SessionPayload;
  try {
    const decoded = new TextDecoder().decode(b64urlToBuf(payloadB64));
    payload = JSON.parse(decoded) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  if (typeof payload.uid !== "string" || typeof payload.un !== "string") return null;
  return payload;
}
