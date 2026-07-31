import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Agent credentials for the control plane itself.
 *
 * These authenticate an agent *to AgentOS*; they are not the credentials an
 * agent uses to move money. Downstream credentials never reach the agent — the
 * agent receives a capability grant instead, and a connector behind the vault
 * boundary performs the privileged call.
 *
 * Only standard primitives from `node:crypto` are used. AgentOS does not
 * implement bespoke cryptography.
 */

const SECRET_PATTERN = /^aos_sk_[a-f0-9]{8}_[a-f0-9]{48}$/;

/** `aos_sk_` plus eight hex characters. */
export const API_KEY_PREFIX_LENGTH = "aos_sk_".length + 8;

export type GeneratedApiKey = {
  /** Shown to the operator exactly once, then discarded by the server. */
  secret: string;
  /** Non-secret lookup handle, safe to display and index. */
  prefix: string;
  secretHash: string;
};

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = `aos_sk_${randomBytes(4).toString("hex")}`;
  const secret = `${prefix}_${randomBytes(24).toString("hex")}`;

  return { secret, prefix, secretHash: hashApiKeySecret(secret) };
}

export function isWellFormedApiKey(secret: string): boolean {
  return SECRET_PATTERN.test(secret);
}

export function extractApiKeyPrefix(secret: string): string | null {
  if (!isWellFormedApiKey(secret)) return null;

  return secret.slice(0, API_KEY_PREFIX_LENGTH);
}

/**
 * Compares digests rather than secrets, in constant time, so a caller cannot
 * learn key material from response timing.
 */
export function apiKeySecretMatches(secret: string, expectedHash: string): boolean {
  const candidate = Buffer.from(hashApiKeySecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (candidate.length !== expected.length) return false;

  return timingSafeEqual(candidate, expected);
}
