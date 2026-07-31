import { createHash } from "node:crypto";
import type { Policy } from "@/domain/schemas";

/**
 * Canonical preimages for the policy-anchor commitments.
 *
 * These are the only place a commitment is constructed, so the local anchor and
 * the Midnight adapter necessarily agree on what a given commitment means.
 *
 * The domain separators match `contracts/policy-anchor.compact` exactly. The
 * hash functions do not, and cannot: SHA-256 here, and the ZK-friendly
 * `persistentHash` inside the circuit. The preimage layout is the contract; the
 * digest function is an implementation detail of where the commitment is being
 * published. Nothing in AgentOS treats a local digest as an on-chain proof.
 */

export const CONTROLLER_DOMAIN = "agentos:controller:v1";
export const POLICY_DOMAIN = "agentos:policy:v1";
export const DECISION_DOMAIN = "agentos:decision:v1";

function digest(domain: string, parts: string[]): string {
  const hash = createHash("sha256");
  hash.update(domain, "utf8");

  for (const part of parts) {
    // Length-prefix each field so distinct inputs cannot collide by
    // concatenating to the same byte string.
    hash.update(`\u0000${part.length}\u0000${part}`, "utf8");
  }

  return hash.digest("hex");
}

/**
 * Commits to the policy version that governed a decision.
 *
 * Every constraint that can change the outcome is included, so amending a
 * policy necessarily produces a different commitment and an auditor can detect
 * a decision that claims to have run under a policy it never ran under.
 */
export function buildPolicyCommitment(policy: Policy, secret: string): string {
  const spendWindow = policy.constraints.spendWindow;

  return digest(POLICY_DOMAIN, [
    secret,
    policy.id,
    String(policy.version),
    policy.actionKind,
    policy.constraints.currency,
    String(policy.constraints.maxAmountMinor),
    [...policy.constraints.approvedCounterpartyIds].sort().join(","),
    policy.constraints.resource,
    String(policy.constraints.capabilityTtlSeconds),
    spendWindow
      ? `${spendWindow.windowHours}:${spendWindow.maxAmountMinor}`
      : "none",
    String(policy.approvalRule.threshold),
    String(policy.approvalRule.autoApproveBelowMinor ?? 0),
  ]);
}

/**
 * Derives the once-only marker for a decision.
 *
 * Binding the nullifier to the organization secret means an observer holding
 * only the request id cannot compute it, so the chain does not leak which
 * requests exist. An auditor given the preimage can recompute and verify it.
 */
export function buildDecisionNullifier(input: {
  secret: string;
  organizationId: string;
  actionRequestId: string;
  outcome: "approved" | "executed";
}): string {
  return digest(DECISION_DOMAIN, [
    input.secret,
    input.organizationId,
    input.actionRequestId,
    input.outcome,
  ]);
}

export function buildControllerKey(secret: string, organizationId: string): string {
  return digest(CONTROLLER_DOMAIN, [secret, organizationId]);
}
