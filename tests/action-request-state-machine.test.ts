import {
  InvalidActionTransitionError,
  transitionActionRequest,
  type ActionRequestEventType,
} from "@/application/action-request-state-machine";
import type { ActionRequestState, Actor } from "@/domain/schemas";
import { describe, expect, it } from "vitest";
import { NOW, ORG_ID, buildRequest, isoAt } from "./fixtures";

const actor: Actor = { type: "human", id: "usr_maya", displayName: "Maya Chen" };

function move(state: ActionRequestState, event: ActionRequestEventType) {
  return transitionActionRequest({
    request: buildRequest({ state }),
    event,
    actor,
    organizationId: ORG_ID,
    auditEventId: "evt_0001",
    occurredAt: isoAt(1),
  });
}

describe("transitionActionRequest", () => {
  it("walks the happy path from request to settlement", () => {
    const path: Array<[ActionRequestState, ActionRequestEventType, ActionRequestState]> = [
      ["requested", "START_EVALUATION", "evaluating"],
      ["evaluating", "APPROVAL_REQUIRED", "pending_approval"],
      ["pending_approval", "APPROVALS_SATISFIED", "approved"],
      ["approved", "ISSUE_CAPABILITY", "capability_issued"],
      ["capability_issued", "START_EXECUTION", "executing"],
      ["executing", "MARK_SUCCEEDED", "succeeded"],
    ];

    for (const [from, event, to] of path) {
      expect(move(from, event).request.state).toBe(to);
    }
  });

  it("stamps the transition time on the request", () => {
    const { request } = move("requested", "START_EVALUATION");

    expect(request.updatedAt).toBe(isoAt(1));
    expect(request.createdAt).toBe(NOW);
  });

  it("refuses to skip evaluation and issue a capability directly", () => {
    expect(() => move("requested", "ISSUE_CAPABILITY")).toThrow(
      InvalidActionTransitionError,
    );
  });

  it("refuses to approve a request a human already rejected", () => {
    expect(() => move("denied", "APPROVALS_SATISFIED")).toThrow(
      InvalidActionTransitionError,
    );
  });

  it("refuses to re-execute a settled request", () => {
    expect(() => move("succeeded", "START_EXECUTION")).toThrow(
      InvalidActionTransitionError,
    );
    expect(() => move("failed", "START_EXECUTION")).toThrow(
      InvalidActionTransitionError,
    );
  });

  it("refuses to cancel once a capability exists", () => {
    expect(() => move("capability_issued", "CANCEL")).toThrow(
      InvalidActionTransitionError,
    );
  });

  it("reports the state and event that were rejected", () => {
    try {
      move("expired", "ISSUE_CAPABILITY");
      expect.unreachable("expired requests must not issue capabilities");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidActionTransitionError);
      const invalid = error as InvalidActionTransitionError;
      expect(invalid.currentState).toBe("expired");
      expect(invalid.event).toBe("ISSUE_CAPABILITY");
      expect(invalid.message).toContain("expired");
    }
  });

  it("never mutates the request it was given", () => {
    const request = buildRequest({ state: "requested" });
    const { request: next } = transitionActionRequest({
      request,
      event: "START_EVALUATION",
      actor,
      organizationId: ORG_ID,
      auditEventId: "evt_0001",
      occurredAt: isoAt(1),
    });

    expect(request.state).toBe("requested");
    expect(next).not.toBe(request);
  });
});

describe("audit events emitted by transitions", () => {
  it("records both endpoints of the transition", () => {
    const { auditEvent } = move("requested", "START_EVALUATION");

    expect(auditEvent.eventType).toBe("action.state_changed");
    expect(auditEvent.actionRequestId).toBe("req_invoice_1048");
    expect(auditEvent.organizationId).toBe(ORG_ID);
    expect(auditEvent.actor).toEqual(actor);
    expect(auditEvent.metadata).toMatchObject({
      event: "START_EVALUATION",
      fromState: "requested",
      toState: "evaluating",
    });
  });

  it("marks a denial as denied and a grant as allowed", () => {
    expect(move("evaluating", "POLICY_DENIED").auditEvent.outcome).toBe("denied");
    expect(move("approved", "ISSUE_CAPABILITY").auditEvent.outcome).toBe("allowed");
    expect(move("executing", "MARK_FAILED").auditEvent.outcome).toBe("failed");
    expect(move("requested", "START_EVALUATION").auditEvent.outcome).toBe("info");
  });

  it("classifies capability issuance and execution distinctly", () => {
    expect(move("approved", "ISSUE_CAPABILITY").auditEvent.eventType).toBe(
      "capability.issued",
    );
    expect(move("executing", "MARK_SUCCEEDED").auditEvent.eventType).toBe(
      "action.executed",
    );
  });
});
