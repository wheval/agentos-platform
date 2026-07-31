import { evaluatePaymentPolicy } from "@/application/policy-evaluator";
import { describe, expect, it } from "vitest";
import { NOW, buildAgent, buildPolicy, buildRequest } from "./fixtures";

describe("evaluatePaymentPolicy", () => {
  it("approves a compliant payment when no human approval is required", () => {
    const result = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy({
        approvalRule: { threshold: 0, approverIds: [] },
      }),
      request: buildRequest(),
      evaluatedAt: NOW,
    });

    expect(result).toMatchObject({
      status: "approved",
      reasonCodes: ["POLICY_SATISFIED"],
      requiredApprovals: 0,
    });
  });

  it("requires the configured approval threshold for a compliant payment", () => {
    const result = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy(),
      request: buildRequest(),
      evaluatedAt: NOW,
    });

    expect(result).toMatchObject({
      status: "requires_approval",
      reasonCodes: ["APPROVAL_REQUIRED"],
      requiredApprovals: 1,
    });
  });

  it("denies an amount above the private policy limit", () => {
    const result = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy(),
      request: buildRequest({
        input: {
          ...buildRequest().input,
          amountMinor: 250_001,
        },
      }),
      evaluatedAt: NOW,
    });

    expect(result.status).toBe("denied");
    expect(result.reasonCodes).toContain("AMOUNT_EXCEEDS_LIMIT");
  });

  it("denies an unapproved counterparty and resource", () => {
    const request = buildRequest({
      input: {
        ...buildRequest().input,
        counterpartyId: "cpty_unknown",
        resource: "treasury:reserve",
      },
    });
    const result = evaluatePaymentPolicy({
      agent: buildAgent(),
      policy: buildPolicy(),
      request,
      evaluatedAt: NOW,
    });

    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "COUNTERPARTY_NOT_ALLOWED",
        "RESOURCE_NOT_ALLOWED",
      ]),
    );
  });

  it("denies a paused agent even when the payment otherwise complies", () => {
    const result = evaluatePaymentPolicy({
      agent: buildAgent({ status: "paused" }),
      policy: buildPolicy(),
      request: buildRequest(),
      evaluatedAt: NOW,
    });

    expect(result).toMatchObject({
      status: "denied",
      reasonCodes: ["AGENT_INACTIVE"],
    });
  });
});
