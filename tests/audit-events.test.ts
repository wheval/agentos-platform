import { createAuditEvent } from "@/application/audit-events";
import { AuditEventSchema } from "@/domain/schemas";
import { describe, expect, it } from "vitest";

describe("createAuditEvent", () => {
  it("creates a structured event with explicit actor and outcome", () => {
    const event = createAuditEvent({
      id: "evt_policy_evaluation",
      organizationId: "org_acme",
      actionRequestId: "req_invoice_1048",
      actor: {
        type: "system",
        id: "policy-engine",
        displayName: "Policy engine",
      },
      eventType: "policy.evaluated",
      outcome: "allowed",
      summary: "Payment policy requires one human approval",
      metadata: { policyVersion: 3, approvalRequired: true },
      occurredAt: "2026-07-31T12:00:00.000Z",
    });

    expect(event.metadata).toEqual({
      policyVersion: 3,
      approvalRequired: true,
    });
  });

  it("rejects unrecognized audit fields instead of silently accepting them", () => {
    expect(() =>
      AuditEventSchema.parse({
        id: "evt_untrusted",
        organizationId: "org_acme",
        actor: {
          type: "system",
          id: "policy-engine",
          displayName: "Policy engine",
        },
        eventType: "policy.evaluated",
        outcome: "allowed",
        summary: "Policy evaluated",
        metadata: {},
        occurredAt: "2026-07-31T12:00:00.000Z",
        mutable: true,
      }),
    ).toThrow();
  });
});
