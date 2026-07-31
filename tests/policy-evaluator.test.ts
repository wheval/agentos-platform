import { evaluatePaymentPolicy } from "@/application/policy-evaluator";
import { describe, expect, it } from "vitest";
import { NOW, buildAgent, buildPolicy, buildRequest } from "./fixtures";

describe("evaluatePaymentPolicy", () => {
  it("requires approval when the policy sets a threshold", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy(),
      request: buildRequest(),
      evaluatedAt: NOW,
    });

    expect(evaluation.status).toBe("requires_approval");
    expect(evaluation.reasonCodes).toEqual(["APPROVAL_REQUIRED"]);
    expect(evaluation.requiredApprovals).toBe(1);
    expect(evaluation.policyVersion).toBe(3);
  });

  it("approves without a human when the threshold is zero", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy({
        approvalRule: { threshold: 0, approverIds: ["usr_maya"] },
      }),
      request: buildRequest(),
      evaluatedAt: NOW,
    });

    expect(evaluation.status).toBe("approved");
    expect(evaluation.reasonCodes).toEqual(["POLICY_SATISFIED"]);
    expect(evaluation.requiredApprovals).toBe(0);
  });

  it("collects every violated constraint rather than short-circuiting", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent({ status: "paused", permissions: [] }),
      policy: buildPolicy(),
      request: buildRequest({
        input: {
          amountMinor: 900_000,
          currency: "EUR",
          counterpartyId: "cpty_unknown",
          counterpartyName: "Unknown",
          resource: "treasury:capex",
          reference: "INV-9",
          context: "Attempted spend outside every boundary.",
        },
      }),
      evaluatedAt: NOW,
    });

    expect(evaluation.status).toBe("denied");
    expect(evaluation.reasonCodes).toEqual([
      "AGENT_INACTIVE",
      "AGENT_NOT_AUTHORIZED",
      "CURRENCY_NOT_ALLOWED",
      "AMOUNT_EXCEEDS_LIMIT",
      "COUNTERPARTY_NOT_ALLOWED",
      "RESOURCE_NOT_ALLOWED",
    ]);
    expect(evaluation.requiredApprovals).toBe(0);
  });

  it("denies a request evaluated outside the policy validity window", () => {
    const policy = buildPolicy();

    expect(
      evaluatePaymentPolicy({
        agent: buildAgent(),
        policy,
        request: buildRequest(),
        evaluatedAt: "2025-06-01T00:00:00.000Z",
      }).reasonCodes,
    ).toContain("POLICY_NOT_YET_ACTIVE");

    expect(
      evaluatePaymentPolicy({
        agent: buildAgent(),
        policy,
        request: buildRequest(),
        evaluatedAt: "2027-06-01T00:00:00.000Z",
      }).reasonCodes,
    ).toContain("POLICY_EXPIRED");
  });

  it("denies a request that names a different agent or policy", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy(),
      request: buildRequest({
        agentId: "agt_research",
        policyId: "pol_other",
      }),
      evaluatedAt: NOW,
    });

    expect(evaluation.reasonCodes).toContain("REQUEST_AGENT_MISMATCH");
    expect(evaluation.reasonCodes).toContain("REQUEST_POLICY_MISMATCH");
  });

  it("is deterministic and free of side effects", () => {
    const args = {
      agent: buildAgent(),
      policy: buildPolicy(),
      request: buildRequest(),
      evaluatedAt: NOW,
    };

    expect(evaluatePaymentPolicy(args)).toEqual(evaluatePaymentPolicy(args));
  });
});

describe("standing authority", () => {
  const standingPolicy = buildPolicy({
    approvalRule: {
      threshold: 1,
      approverIds: ["usr_maya"],
      autoApproveBelowMinor: 5_000,
    },
  });

  it("auto-approves strictly below the standing limit", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: standingPolicy,
      request: buildRequest({
        input: {
          amountMinor: 4_999,
          currency: "USD",
          counterpartyId: "cpty_acme",
          counterpartyName: "Acme Cloud",
          resource: "treasury:operating",
          reference: "API-1",
          context: "Routine metered API usage.",
        },
      }),
      evaluatedAt: NOW,
    });

    expect(evaluation.status).toBe("approved");
    expect(evaluation.reasonCodes).toEqual(["AUTO_APPROVED_UNDER_THRESHOLD"]);
  });

  it("still requires a human exactly at the standing limit", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: standingPolicy,
      request: buildRequest({
        input: {
          amountMinor: 5_000,
          currency: "USD",
          counterpartyId: "cpty_acme",
          counterpartyName: "Acme Cloud",
          resource: "treasury:operating",
          reference: "API-2",
          context: "Usage at the standing ceiling.",
        },
      }),
      evaluatedAt: NOW,
    });

    expect(evaluation.status).toBe("requires_approval");
    expect(evaluation.reasonCodes).toEqual(["APPROVAL_REQUIRED"]);
  });
});

describe("rolling spend windows", () => {
  const windowedPolicy = buildPolicy({
    constraints: {
      currency: "USD",
      maxAmountMinor: 250_000,
      approvedCounterpartyIds: ["cpty_acme"],
      resource: "treasury:operating",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      capabilityTtlSeconds: 300,
      spendWindow: { windowHours: 168, maxAmountMinor: 300_000 },
    },
  });

  it("reports the projected window position on an allowed request", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: windowedPolicy,
      request: buildRequest(),
      evaluatedAt: NOW,
      windowSpendMinor: 50_000,
    });

    expect(evaluation.status).toBe("requires_approval");
    expect(evaluation.spendWindow).toEqual({
      windowHours: 168,
      maxAmountMinor: 300_000,
      priorSpendMinor: 50_000,
      projectedSpendMinor: 234_200,
    });
  });

  it("denies when the window ceiling would be crossed", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: windowedPolicy,
      request: buildRequest(),
      evaluatedAt: NOW,
      windowSpendMinor: 200_000,
    });

    expect(evaluation.status).toBe("denied");
    expect(evaluation.reasonCodes).toEqual(["SPEND_WINDOW_EXCEEDED"]);
    expect(evaluation.spendWindow?.projectedSpendMinor).toBe(384_200);
  });

  it("allows a request that lands exactly on the ceiling", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: windowedPolicy,
      request: buildRequest(),
      evaluatedAt: NOW,
      windowSpendMinor: 115_800,
    });

    expect(evaluation.spendWindow?.projectedSpendMinor).toBe(300_000);
    expect(evaluation.reasonCodes).not.toContain("SPEND_WINDOW_EXCEEDED");
  });

  it("omits window reporting for policies without a window", () => {
    const evaluation = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy(),
      request: buildRequest(),
      evaluatedAt: NOW,
      windowSpendMinor: 999_999,
    });

    expect(evaluation.spendWindow).toBeUndefined();
    expect(evaluation.reasonCodes).not.toContain("SPEND_WINDOW_EXCEEDED");
  });
});
