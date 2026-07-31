import { randomUUID } from "node:crypto";

/**
 * Prefixed identifiers keep entity types legible in logs, URLs and audit
 * records, and let the domain schemas reject an identifier that belongs to the
 * wrong entity rather than silently accepting it.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}
