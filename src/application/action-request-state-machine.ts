import { createAuditEvent } from "@/application/audit-events";
import {
  ActionRequestSchema,
  ActorSchema,
  TimestampSchema,
  type ActionRequest,
  type ActionRequestState,
  type Actor,
  type AuditEvent,
} from "@/domain/schemas";
import { z } from "zod";

const ActionRequestEventTypeSchema = z.enum([
  "START_EVALUATION",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "POLICY_APPROVED",
  "APPROVALS_SATISFIED",
  "APPROVAL_REJECTED",
  "ISSUE_CAPABILITY",
  "START_EXECUTION",
  "MARK_SUCCEEDED",
  "MARK_FAILED",
  "EXPIRE",
  "CANCEL",
]);

export type ActionRequestEventType = z.infer<
  typeof ActionRequestEventTypeSchema
>;

const transitions: Record<
  ActionRequestState,
  Partial<Record<ActionRequestEventType, ActionRequestState>>
> = {
  requested: {
    START_EVALUATION: "evaluating",
    CANCEL: "cancelled",
  },
  evaluating: {
    POLICY_DENIED: "denied",
    APPROVAL_REQUIRED: "pending_approval",
    POLICY_APPROVED: "approved",
    CANCEL: "cancelled",
  },
  pending_approval: {
    APPROVALS_SATISFIED: "approved",
    APPROVAL_REJECTED: "denied",
    EXPIRE: "expired",
    CANCEL: "cancelled",
  },
  approved: {
    ISSUE_CAPABILITY: "capability_issued",
    EXPIRE: "expired",
    CANCEL: "cancelled",
  },
  capability_issued: {
    START_EXECUTION: "executing",
    EXPIRE: "expired",
  },
  executing: {
    MARK_SUCCEEDED: "succeeded",
    MARK_FAILED: "failed",
  },
  denied: {},
  succeeded: {},
  failed: {},
  expired: {},
  cancelled: {},
};

export class InvalidActionTransitionError extends Error {
  constructor(
    readonly currentState: ActionRequestState,
    readonly event: ActionRequestEventType,
  ) {
    super(`Cannot apply ${event} while action request is ${currentState}`);
    this.name = "InvalidActionTransitionError";
  }
}

function auditEventTypeFor(
  event: ActionRequestEventType,
): AuditEvent["eventType"] {
  if (event === "ISSUE_CAPABILITY") return "capability.issued";
  if (event === "MARK_SUCCEEDED" || event === "MARK_FAILED") {
    return "action.executed";
  }
  return "action.state_changed";
}

function auditOutcomeFor(
  nextState: ActionRequestState,
): AuditEvent["outcome"] {
  if (nextState === "denied") return "denied";
  if (nextState === "failed") return "failed";
  if (
    nextState === "approved" ||
    nextState === "capability_issued" ||
    nextState === "succeeded"
  ) {
    return "allowed";
  }
  return "info";
}

export function transitionActionRequest(input: {
  request: ActionRequest;
  event: ActionRequestEventType;
  actor: Actor;
  organizationId: string;
  auditEventId: string;
  occurredAt: string;
}): { request: ActionRequest; auditEvent: AuditEvent } {
  const request = ActionRequestSchema.parse(input.request);
  const event = ActionRequestEventTypeSchema.parse(input.event);
  const actor = ActorSchema.parse(input.actor);
  const occurredAt = TimestampSchema.parse(input.occurredAt);
  const nextState = transitions[request.state][event];

  if (!nextState) {
    throw new InvalidActionTransitionError(request.state, event);
  }

  const nextRequest = ActionRequestSchema.parse({
    ...request,
    state: nextState,
    updatedAt: occurredAt,
  });
  const auditEvent = createAuditEvent({
    id: input.auditEventId,
    organizationId: input.organizationId,
    actionRequestId: request.id,
    actor,
    eventType: auditEventTypeFor(event),
    outcome: auditOutcomeFor(nextState),
    summary: `${request.id} moved from ${request.state} to ${nextState}`,
    metadata: {
      event,
      fromState: request.state,
      toState: nextState,
    },
    occurredAt,
  });

  return { request: nextRequest, auditEvent };
}
