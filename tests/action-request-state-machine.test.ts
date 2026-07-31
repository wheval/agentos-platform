import {
  InvalidActionTransitionError,
  transitionActionRequest,
  type ActionRequestEventType,
} from "@/application/action-request-state-machine";
import type { ActionRequest } from "@/domain/schemas";
import { describe, expect, it } from "vitest";
import { buildRequest } from "./fixtures";

const actor = {
  type: "system" as const,
  id: "policy-engine",
  displayName: "Policy engine",
};

function apply(request: ActionRequest, event: ActionRequestEventType) {
  return transitionActionRequest({
    request,
    event,
    actor,
    organizationId: "org_acme",
    auditEventId: `evt_${request.state}_${event.toLowerCase()}`,
    occurredAt: "2026-07-31T12:03:00.000Z",
  });
}

describe("transitionActionRequest", () => {
  it("supports the approval-gated capped-payment path", () => {
    const evaluating = apply(buildRequest(), "START_EVALUATION").request;
    const pending = apply(evaluating, "APPROVAL_REQUIRED").request;
    const approved = apply(pending, "APPROVALS_SATISFIED").request;
    const issued = apply(approved, "ISSUE_CAPABILITY").request;
    const executing = apply(issued, "START_EXECUTION").request;
    const succeeded = apply(executing, "MARK_SUCCEEDED").request;

    expect(succeeded.state).toBe("succeeded");
  });

  it("rejects transitions that bypass policy evaluation", () => {
    expect(() => apply(buildRequest(), "ISSUE_CAPABILITY")).toThrow(
      InvalidActionTransitionError,
    );
  });

  it("keeps terminal states immutable", () => {
    const request = buildRequest({ state: "denied" });

    expect(() => apply(request, "START_EVALUATION")).toThrow(
      "Cannot apply START_EVALUATION while action request is denied",
    );
  });

  it("emits a validated audit event for every accepted transition", () => {
    const result = apply(buildRequest(), "START_EVALUATION");

    expect(result.auditEvent).toMatchObject({
      actionRequestId: "req_invoice_1048",
      eventType: "action.state_changed",
      outcome: "info",
      metadata: {
        event: "START_EVALUATION",
        fromState: "requested",
        toState: "evaluating",
      },
    });
  });
});
