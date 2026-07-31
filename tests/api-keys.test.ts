import {
  API_KEY_PREFIX_LENGTH,
  apiKeySecretMatches,
  extractApiKeyPrefix,
  generateApiKey,
  hashApiKeySecret,
  isWellFormedApiKey,
} from "@/lib/api-keys";
import { describe, expect, it } from "vitest";

describe("generateApiKey", () => {
  it("produces a well-formed secret whose prefix is a proper prefix of it", () => {
    const key = generateApiKey();

    expect(isWellFormedApiKey(key.secret)).toBe(true);
    expect(key.secret.startsWith(key.prefix)).toBe(true);
    expect(key.prefix).toHaveLength(API_KEY_PREFIX_LENGTH);
    expect(key.prefix).toMatch(/^aos_sk_[a-f0-9]{8}$/);
  });

  it("returns the digest of the secret, never the secret itself", () => {
    const key = generateApiKey();

    expect(key.secretHash).toBe(hashApiKeySecret(key.secret));
    expect(key.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(key.secretHash).not.toContain(key.secret);
  });

  it("does not repeat itself", () => {
    const secrets = new Set(
      Array.from({ length: 50 }, () => generateApiKey().secret),
    );

    expect(secrets.size).toBe(50);
  });
});

describe("isWellFormedApiKey", () => {
  it.each([
    ["an empty string", ""],
    ["a bare word", "hunter2"],
    ["the wrong product prefix", "sk_live_0123456789abcdef"],
    ["a truncated secret", "aos_sk_0123abcd_0011"],
    ["uppercase hex", "aos_sk_0123ABCD_" + "a".repeat(48)],
    ["trailing whitespace", `aos_sk_0123abcd_${"a".repeat(48)} `],
  ])("rejects %s", (_label, candidate) => {
    expect(isWellFormedApiKey(candidate)).toBe(false);
    expect(extractApiKeyPrefix(candidate)).toBeNull();
  });

  it("accepts a generated key and yields its lookup prefix", () => {
    const key = generateApiKey();

    expect(extractApiKeyPrefix(key.secret)).toBe(key.prefix);
  });
});

describe("apiKeySecretMatches", () => {
  it("accepts the secret that produced the digest", () => {
    const key = generateApiKey();

    expect(apiKeySecretMatches(key.secret, key.secretHash)).toBe(true);
  });

  it("rejects a different secret", () => {
    const key = generateApiKey();
    const other = generateApiKey();

    expect(apiKeySecretMatches(other.secret, key.secretHash)).toBe(false);
  });

  it("rejects a malformed stored digest instead of throwing", () => {
    const key = generateApiKey();

    expect(apiKeySecretMatches(key.secret, "deadbeef")).toBe(false);
    expect(apiKeySecretMatches(key.secret, "")).toBe(false);
  });

  it("is sensitive to a single-character change", () => {
    const key = generateApiKey();
    const tampered = `${key.secret.slice(0, -1)}${key.secret.endsWith("a") ? "b" : "a"}`;

    expect(apiKeySecretMatches(tampered, key.secretHash)).toBe(false);
  });
});
