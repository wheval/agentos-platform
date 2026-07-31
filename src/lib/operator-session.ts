import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Operator sessions.
 *
 * A shared operator token is deliberately the whole authentication story for
 * this milestone. It is honest about its own limits: one credential, no user
 * identities, no revocation beyond rotating the token. SSO, per-operator
 * accounts and hardware-backed approval are the next step and are not
 * pretended to exist.
 *
 * The cookie is HMAC-signed rather than encrypted. It carries no secrets — only
 * an issue time — so integrity is the only property required.
 */

const COOKIE_NAME = "agentos_operator";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function signingKey(): string | undefined {
  const token = process.env.AGENTOS_OPERATOR_TOKEN?.trim();

  return token && token.length > 0 ? token : undefined;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload, "utf8").digest("hex");
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

export type OperatorSession =
  | { authenticated: true; mode: "demo" | "token"; issuedAt: number }
  | { authenticated: false; mode: "token" };

/**
 * Resolves the caller's session.
 *
 * With no token configured the app runs open, in demo mode, and every surface
 * says so. That is the right default for a public demo and the wrong default
 * for anything real, which is why the banner is not dismissible.
 */
export async function readOperatorSession(): Promise<OperatorSession> {
  const key = signingKey();

  if (!key) return { authenticated: true, mode: "demo", issuedAt: 0 };

  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;

  if (!raw) return { authenticated: false, mode: "token" };

  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return { authenticated: false, mode: "token" };

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);

  if (!safeEquals(signature, sign(payload, key))) {
    return { authenticated: false, mode: "token" };
  }

  const issuedAt = Number.parseInt(payload, 10);

  if (!Number.isFinite(issuedAt)) return { authenticated: false, mode: "token" };

  if (Date.now() / 1000 - issuedAt > SESSION_TTL_SECONDS) {
    return { authenticated: false, mode: "token" };
  }

  return { authenticated: true, mode: "token", issuedAt };
}

export async function signInOperator(
  presentedToken: string,
): Promise<{ ok: boolean }> {
  const key = signingKey();

  if (!key) return { ok: true };
  if (!safeEquals(presentedToken.trim(), key)) return { ok: false };

  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const jar = await cookies();

  jar.set(COOKIE_NAME, `${issuedAt}.${sign(issuedAt, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return { ok: true };
}

export async function signOutOperator(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export function operatorAuthConfigured(): boolean {
  return signingKey() !== undefined;
}
