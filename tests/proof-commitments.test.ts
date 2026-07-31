import {
  CONTROLLER_DOMAIN,
  DECISION_DOMAIN,
  POLICY_DOMAIN,
  buildControllerKey,
  buildDecisionNullifier,
  buildPolicyCommitment,
} from "@/application/proof-commitments";
import { describe, expect, it } from "vitest";
import { buildPolicy } from "./fixtures";

const SECRET = "organization-secret";
const HEX_256 = /^[a-f0-9]{64}$/;

function nullifier(overrides: Partial<Parameters<typeof buildDecisionNullifier>[0]> = {}) {
  return buildDecisionNullifier({
    secret: SECRET,
    organizationId: "org_test",
    actionRequestId: "req_invoice_1048",
    outcome: "approved",
    ...overrides,
  });
}

describe("buildPolicyCommitment", () => {
  it("is deterministic for the same policy and secret", () => {
    const policy = buildPolicy();

    expect(buildPolicyCommitment(policy, SECRET)).toBe(
      buildPolicyCommitment(policy, SECRET),
    );
    expect(buildPolicyCommitment(policy, SECRET)).toMatch(HEX_256);
  });

  it("changes when any outcome-affecting constraint changes", () => {
    const baseline = buildPolicyCommitment(buildPolicy(), SECRET);
    const variants = [
      buildPolicy({ version: 4 }),
      buildPolicy({
        constraints: { ...buildPolicy().constraints, maxAmountMinor: 250_001 },
      }),
      buildPolicy({
        constraints: {
          ...buildPolicy().constraints,
          approvedCounterpartyIds: ["cpty_acme", "cpty_globex"],
        },
      }),
      buildPolicy({
        constraints: {
          ...buildPolicy().constraints,
          spendWindow: { windowHours: 168, maxAmountMinor: 300_000 },
        },
      }),
      buildPolicy({
        approvalRule: { threshold: 2, approverIds: ["usr_maya", "usr_omar"] },
      }),
      buildPolicy({
        approvalRule: {
          threshold: 1,
          approverIds: ["usr_maya", "usr_omar"],
          autoApproveBelowMinor: 5_000,
        },
      }),
    ];

    for (const variant of variants) {
      expect(buildPolicyCommitment(variant, SECRET)).not.toBe(baseline);
    }
  });

  it("does not change when a non-binding field changes", () => {
    const baseline = buildPolicyCommitment(buildPolicy(), SECRET);
    const renamed = buildPolicy({
      name: "Renamed policy",
      description: "Same rules, different prose.",
    });

    expect(buildPolicyCommitment(renamed, SECRET)).toBe(baseline);
  });

  it("is stable regardless of counterparty ordering", () => {
    const constraints = buildPolicy().constraints;
    const ascending = buildPolicy({
      constraints: {
        ...constraints,
        approvedCounterpartyIds: ["cpty_acme", "cpty_globex"],
      },
    });
    const descending = buildPolicy({
      constraints: {
        ...constraints,
        approvedCounterpartyIds: ["cpty_globex", "cpty_acme"],
      },
    });

    expect(buildPolicyCommitment(ascending, SECRET)).toBe(
      buildPolicyCommitment(descending, SECRET),
    );
  });

  it("differs across organizations holding the same policy", () => {
    const policy = buildPolicy();

    expect(buildPolicyCommitment(policy, SECRET)).not.toBe(
      buildPolicyCommitment(policy, "another-organization-secret"),
    );
  });
});

describe("buildDecisionNullifier", () => {
  it("is deterministic and hex-encoded", () => {
    expect(nullifier()).toBe(nullifier());
    expect(nullifier()).toMatch(HEX_256);
  });

  it("distinguishes approval from execution of the same request", () => {
    expect(nullifier({ outcome: "approved" })).not.toBe(
      nullifier({ outcome: "executed" }),
    );
  });

  it("distinguishes different requests and different organizations", () => {
    expect(nullifier({ actionRequestId: "req_invoice_1049" })).not.toBe(nullifier());
    expect(nullifier({ organizationId: "org_other" })).not.toBe(nullifier());
  });

  it("cannot be recomputed without the organization secret", () => {
    expect(nullifier({ secret: "guessed-secret" })).not.toBe(nullifier());
  });
});

describe("domain separation", () => {
  it("uses three distinct separators", () => {
    const domains = new Set([CONTROLLER_DOMAIN, POLICY_DOMAIN, DECISION_DOMAIN]);

    expect(domains.size).toBe(3);
  });

  it("never lets a controller key collide with a decision nullifier", () => {
    expect(buildControllerKey(SECRET, "org_test")).not.toBe(
      nullifier({ actionRequestId: "org_test", outcome: "approved" }),
    );
  });

  it("length-prefixes fields so boundaries cannot be shifted", () => {
    // Without length prefixing, ("ab", "c") and ("a", "bc") would collide.
    const left = buildDecisionNullifier({
      secret: SECRET,
      organizationId: "org_ab",
      actionRequestId: "req_c",
      outcome: "approved",
    });
    const right = buildDecisionNullifier({
      secret: SECRET,
      organizationId: "org_a",
      actionRequestId: "breq_c",
      outcome: "approved",
    });

    expect(left).not.toBe(right);
  });
});
