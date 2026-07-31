import { evaluateApprovalThreshold } from "@/application/approval-service";
import { createAuditEvent } from "@/application/audit-events";
import {
  transitionActionRequest,
  type ActionRequestEventType,
} from "@/application/action-request-state-machine";
import { authorizeCapabilityUse } from "@/application/capability-service";
import { evaluatePaymentPolicy } from "@/application/policy-evaluator";
import type { PaymentConnector } from "@/application/ports/payment-connector";
import type { PolicyProofAnchor } from "@/application/ports/policy-proof";
import type { AgentOsStore } from "@/application/ports/store";
import {
  buildDecisionNullifier,
  buildPolicyCommitment,
} from "@/application/proof-commitments";
import {
  computeCommittedSpendMinor,
  windowStartIso,
} from "@/application/spend-window";
import {
  ActionRequestSchema,
  ApprovalSchema,
  CapabilityGrantSchema,
  ExecutionReceiptSchema,
  PaymentActionInputSchema,
  ProofAnchorSchema,
  type ActionRequest,
  type Actor,
  type ApiKey,
  type Approval,
  type AuditEvent,
  type CapabilityGrant,
  type ExecutionReceipt,
  type PaymentActionInput,
  type Policy,
} from "@/domain/schemas";
import { apiKeySecretMatches, extractApiKeyPrefix } from "@/lib/api-keys";
import { newId as defaultNewId } from "@/lib/ids";

export type AuthorityErrorCode =
  | "AGENT_NOT_FOUND"
  | "POLICY_NOT_FOUND"
  | "REQUEST_NOT_FOUND"
  | "CAPABILITY_NOT_FOUND"
  | "APPROVER_NOT_AUTHORIZED"
  | "INVALID_STATE"
  | "CAPABILITY_DENIED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "VALIDATION_FAILED";

export type AuthorityError = {
  code: AuthorityErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type AuthorityResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuthorityError };

export type AuthorityServiceOptions = {
  store: AgentOsStore;
  connector: PaymentConnector;
  organizationId: string;
  proofAnchor: PolicyProofAnchor;
  /**
   * Seed for every commitment this organization publishes. Without it an
   * observer holding a request id could recompute a nullifier and confirm the
   * decision exists, which is exactly the leak the anchor is meant to prevent.
   */
  organizationSecret: string;
  now?: () => Date;
  newId?: (prefix: string) => string;
};

export type SubmitActionRequestInput = {
  agentId: string;
  policyId: string;
  input: PaymentActionInput;
  actor: Actor;
};

export type ExecuteCapabilityInput = {
  capabilityId: string;
  agentId: string;
  idempotencyKey: string;
  actor: Actor;
};

/**
 * The single place where authority is granted, exercised and withdrawn.
 *
 * Every route, server action and MCP tool goes through this service so there is
 * exactly one implementation of the lifecycle and exactly one writer of the
 * audit ledger. The service owns orchestration only: policy semantics live in
 * the evaluator, legal transitions live in the state machine, and settlement
 * lives behind the connector port.
 */
export class AuthorityService {
  readonly #store: AgentOsStore;
  readonly #connector: PaymentConnector;
  readonly #organizationId: string;
  readonly #proofAnchor: PolicyProofAnchor;
  readonly #organizationSecret: string;
  readonly #now: () => Date;
  readonly #newId: (prefix: string) => string;

  constructor(options: AuthorityServiceOptions) {
    this.#store = options.store;
    this.#connector = options.connector;
    this.#organizationId = options.organizationId;
    this.#proofAnchor = options.proofAnchor;
    this.#organizationSecret = options.organizationSecret;
    this.#now = options.now ?? (() => new Date());
    this.#newId = options.newId ?? defaultNewId;
  }

  /**
   * Resolves an agent API key to the agent it belongs to.
   *
   * Rejections are recorded in the audit ledger: a stream of failed
   * authentications against a known prefix is exactly the signal an operator
   * needs to revoke a leaked key.
   */
  async authenticateAgent(
    presentedSecret: string,
  ): Promise<AuthorityResult<{ apiKey: ApiKey; agentId: string }>> {
    const prefix = extractApiKeyPrefix(presentedSecret);
    const unauthorized: AuthorityError = {
      code: "VALIDATION_FAILED",
      message: "Invalid or revoked API key",
    };

    if (!prefix) return { ok: false, error: unauthorized };

    const apiKey = await this.#store.getApiKeyByPrefix(prefix);

    if (!apiKey || apiKey.revokedAt) {
      await this.#recordCredentialRejection(prefix, apiKey ? "revoked" : "unknown");

      return { ok: false, error: unauthorized };
    }

    if (!apiKeySecretMatches(presentedSecret, apiKey.secretHash)) {
      await this.#recordCredentialRejection(prefix, "secret_mismatch");

      return { ok: false, error: unauthorized };
    }

    const now = this.#nowIso();
    await this.#store.upsertApiKey({ ...apiKey, lastUsedAt: now });

    return { ok: true, value: { apiKey, agentId: apiKey.agentId } };
  }

  /**
   * Accepts an intent, evaluates it against policy, and lands it in the state
   * the decision implies. Runs under the store lock because the spend-window
   * read and the resulting decision must not interleave with another request.
   */
  async submitActionRequest(
    input: SubmitActionRequestInput,
  ): Promise<AuthorityResult<{ request: ActionRequest }>> {
    const parsedInput = PaymentActionInputSchema.safeParse(input.input);

    if (!parsedInput.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Action input failed validation",
          details: { issues: parsedInput.error.issues },
        },
      };
    }

    return this.#store.runExclusive(async () => {
      const agent = await this.#store.getAgent(input.agentId);

      if (!agent) {
        return {
          ok: false as const,
          error: { code: "AGENT_NOT_FOUND" as const, message: "Unknown agent" },
        };
      }

      const policy = await this.#store.getPolicy(input.policyId);

      if (!policy) {
        return {
          ok: false as const,
          error: { code: "POLICY_NOT_FOUND" as const, message: "Unknown policy" },
        };
      }

      const now = this.#nowIso();
      const events: AuditEvent[] = [];
      let request = ActionRequestSchema.parse({
        id: this.#newId("req"),
        organizationId: this.#organizationId,
        type: policy.actionKind,
        agentId: agent.id,
        policyId: policy.id,
        state: "requested",
        input: parsedInput.data,
        createdAt: now,
        updatedAt: now,
      });

      events.push(
        createAuditEvent({
          id: this.#newId("evt"),
          organizationId: this.#organizationId,
          actionRequestId: request.id,
          actor: input.actor,
          eventType: "action.requested",
          outcome: "info",
          summary: `${agent.name} requested ${formatAmount(
            parsedInput.data.amountMinor,
            parsedInput.data.currency,
          )} to ${parsedInput.data.counterpartyName}`,
          metadata: {
            amountMinor: parsedInput.data.amountMinor,
            currency: parsedInput.data.currency,
            counterpartyId: parsedInput.data.counterpartyId,
            context: parsedInput.data.context,
          },
          occurredAt: now,
        }),
      );

      request = this.#applyTransition(
        request,
        "START_EVALUATION",
        input.actor,
        now,
        events,
      );

      const windowSpendMinor = await this.#committedSpend(policy, now);
      const evaluation = evaluatePaymentPolicy({
        agent,
        policy,
        request,
        evaluatedAt: now,
        windowSpendMinor,
      });

      request = ActionRequestSchema.parse({
        ...request,
        policyEvaluation: evaluation,
      });

      events.push(
        createAuditEvent({
          id: this.#newId("evt"),
          organizationId: this.#organizationId,
          actionRequestId: request.id,
          actor: { type: "system", id: "policy-engine", displayName: "Policy engine" },
          eventType: "policy.evaluated",
          outcome: evaluation.status === "denied" ? "denied" : "allowed",
          summary: `Policy ${policy.name} v${policy.version} returned ${evaluation.status}`,
          metadata: {
            status: evaluation.status,
            reasonCodes: evaluation.reasonCodes.join(","),
            requiredApprovals: evaluation.requiredApprovals,
            windowSpendMinor,
          },
          occurredAt: now,
        }),
      );

      const decisionEvent: ActionRequestEventType =
        evaluation.status === "denied"
          ? "POLICY_DENIED"
          : evaluation.status === "requires_approval"
            ? "APPROVAL_REQUIRED"
            : "POLICY_APPROVED";

      request = this.#applyTransition(
        request,
        decisionEvent,
        input.actor,
        now,
        events,
      );

      if (request.state === "approved") {
        await this.#anchorDecision(request, policy, "approved", events, now);
      }

      await this.#store.upsertActionRequest(request);
      await this.#store.appendAuditEvents(events);

      return { ok: true as const, value: { request } };
    });
  }

  /** Records one approver's decision and advances the request if the rule is met. */
  async recordApproval(input: {
    actionRequestId: string;
    approverId: string;
    approverName: string;
    decision: "approved" | "rejected";
    reason?: string;
  }): Promise<AuthorityResult<{ request: ActionRequest; approval: Approval }>> {
    return this.#store.runExclusive(async () => {
      const request = await this.#store.getActionRequest(input.actionRequestId);

      if (!request) {
        return {
          ok: false as const,
          error: {
            code: "REQUEST_NOT_FOUND" as const,
            message: "Unknown action request",
          },
        };
      }

      if (request.state !== "pending_approval") {
        return {
          ok: false as const,
          error: {
            code: "INVALID_STATE" as const,
            message: `Cannot approve a request in state ${request.state}`,
          },
        };
      }

      const policy = await this.#store.getPolicy(request.policyId);

      if (!policy) {
        return {
          ok: false as const,
          error: { code: "POLICY_NOT_FOUND" as const, message: "Unknown policy" },
        };
      }

      if (!policy.approvalRule.approverIds.includes(input.approverId)) {
        return {
          ok: false as const,
          error: {
            code: "APPROVER_NOT_AUTHORIZED" as const,
            message: "Approver is not in the policy approver pool",
          },
        };
      }

      const now = this.#nowIso();
      const actor: Actor = {
        type: "human",
        id: input.approverId,
        displayName: input.approverName,
      };
      const approval = ApprovalSchema.parse({
        id: this.#newId("apr"),
        actionRequestId: request.id,
        approverId: input.approverId,
        approverName: input.approverName,
        decision: input.decision,
        reason: input.reason,
        createdAt: now,
      });

      await this.#store.appendApproval(approval);

      const events: AuditEvent[] = [
        createAuditEvent({
          id: this.#newId("evt"),
          organizationId: this.#organizationId,
          actionRequestId: request.id,
          actor,
          eventType: "approval.recorded",
          outcome: input.decision === "approved" ? "allowed" : "denied",
          summary: `${input.approverName} ${input.decision} ${request.id}`,
          metadata: { decision: input.decision, reason: input.reason ?? null },
          occurredAt: now,
        }),
      ];

      const approvals = await this.#store.listApprovalsForRequest(request.id);
      const threshold = evaluateApprovalThreshold({ request, policy, approvals });

      let nextRequest = request;

      if (threshold.status === "rejected") {
        nextRequest = this.#applyTransition(
          request,
          "APPROVAL_REJECTED",
          actor,
          now,
          events,
        );
      } else if (threshold.status === "satisfied") {
        nextRequest = this.#applyTransition(
          request,
          "APPROVALS_SATISFIED",
          actor,
          now,
          events,
        );

        await this.#anchorDecision(nextRequest, policy, "approved", events, now);
      }

      if (nextRequest !== request) {
        await this.#store.upsertActionRequest(nextRequest);
      }

      await this.#store.appendAuditEvents(events);

      return { ok: true as const, value: { request: nextRequest, approval } };
    });
  }

  /**
   * Mints the short-lived, single-purpose grant an agent redeems.
   *
   * The grant carries the narrowest scope that can satisfy the request — this
   * action kind, this resource, this counterparty, this amount ceiling, this
   * currency, this expiry — and no credential material whatsoever.
   */
  async issueCapability(input: {
    actionRequestId: string;
    actor: Actor;
  }): Promise<AuthorityResult<{ request: ActionRequest; capability: CapabilityGrant }>> {
    return this.#store.runExclusive(async () => {
      const request = await this.#store.getActionRequest(input.actionRequestId);

      if (!request) {
        return {
          ok: false as const,
          error: {
            code: "REQUEST_NOT_FOUND" as const,
            message: "Unknown action request",
          },
        };
      }

      const policy = await this.#store.getPolicy(request.policyId);

      if (!policy) {
        return {
          ok: false as const,
          error: { code: "POLICY_NOT_FOUND" as const, message: "Unknown policy" },
        };
      }

      if (request.state !== "approved") {
        return {
          ok: false as const,
          error: {
            code: "INVALID_STATE" as const,
            message: `Cannot issue a capability while request is ${request.state}`,
          },
        };
      }

      const now = this.#nowIso();
      const events: AuditEvent[] = [];

      const capability = CapabilityGrantSchema.parse({
        id: this.#newId("cap"),
        actionRequestId: request.id,
        policyId: policy.id,
        issuedToAgentId: request.agentId,
        status: "active",
        scope: {
          actionKind: request.type,
          resource: request.input.resource,
          amountLimitMinor: request.input.amountMinor,
          currency: request.input.currency,
          counterpartyId: request.input.counterpartyId,
        },
        maxUses: 1,
        usesRemaining: 1,
        issuedAt: now,
        expiresAt: new Date(
          new Date(now).getTime() + policy.constraints.capabilityTtlSeconds * 1000,
        ).toISOString(),
      });

      const nextRequest = this.#applyTransition(
        request,
        "ISSUE_CAPABILITY",
        input.actor,
        now,
        events,
      );

      await this.#store.upsertCapability(capability);
      await this.#store.upsertActionRequest(nextRequest);
      await this.#store.appendAuditEvents(events);

      return { ok: true as const, value: { request: nextRequest, capability } };
    });
  }

  /**
   * Redeems a capability exactly once.
   *
   * The idempotency key is checked first: a retried call returns the original
   * receipt rather than settling again. Scope is then re-verified at redemption
   * time, because a grant that was valid when issued may have expired or been
   * revoked since.
   */
  async executeCapability(
    input: ExecuteCapabilityInput,
  ): Promise<AuthorityResult<{ receipt: ExecutionReceipt; request: ActionRequest }>> {
    if (input.idempotencyKey.length < 8) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "Idempotency key must be at least 8 characters",
        },
      };
    }

    return this.#store.runExclusive(async () => {
      // Scoped to the calling agent. A global lookup would let any
      // authenticated agent present a key belonging to someone else and
      // receive that agent's receipt and full request before a single
      // authorization check ran — and, worse, be told the action succeeded
      // while their own execution was silently skipped.
      //
      // Because the lookup is scoped, a foreign key simply does not resolve:
      // the caller falls through to normal execution and learns nothing about
      // whether that key exists elsewhere.
      const existing = await this.#store.getReceiptByIdempotencyKey(
        input.agentId,
        input.idempotencyKey,
      );

      if (existing) {
        // The agent's own key, but pointed at a different grant. Returning the
        // stored receipt would confirm an action the caller did not name, so
        // this fails closed. Retrying the same key against the same capability
        // — the case idempotency exists for — still replays.
        if (existing.capabilityId !== input.capabilityId) {
          return {
            ok: false as const,
            error: {
              code: "IDEMPOTENCY_KEY_REUSED" as const,
              message:
                "Idempotency key was already used for a different capability",
            },
          };
        }

        const replayed = await this.#store.getActionRequest(existing.actionRequestId);

        return replayed
          ? { ok: true as const, value: { receipt: existing, request: replayed } }
          : {
              ok: false as const,
              error: {
                code: "REQUEST_NOT_FOUND" as const,
                message: "Unknown action request",
              },
            };
      }

      const capability = await this.#store.getCapability(input.capabilityId);

      if (!capability) {
        return {
          ok: false as const,
          error: {
            code: "CAPABILITY_NOT_FOUND" as const,
            message: "Unknown capability",
          },
        };
      }

      const request = await this.#store.getActionRequest(capability.actionRequestId);

      if (!request) {
        return {
          ok: false as const,
          error: {
            code: "REQUEST_NOT_FOUND" as const,
            message: "Unknown action request",
          },
        };
      }

      const policy = await this.#store.getPolicy(request.policyId);

      if (!policy) {
        return {
          ok: false as const,
          error: { code: "POLICY_NOT_FOUND" as const, message: "Unknown policy" },
        };
      }

      const now = this.#nowIso();
      const authorization = authorizeCapabilityUse(
        capability,
        {
          agentId: input.agentId,
          actionRequestId: request.id,
          actionKind: request.type,
          resource: request.input.resource,
          amountMinor: request.input.amountMinor,
          currency: request.input.currency,
          counterpartyId: request.input.counterpartyId,
        },
        now,
      );

      if (!authorization.authorized) {
        await this.#store.appendAuditEvents([
          createAuditEvent({
            id: this.#newId("evt"),
            organizationId: this.#organizationId,
            actionRequestId: request.id,
            actor: input.actor,
            eventType: "action.executed",
            outcome: "denied",
            summary: `Capability ${capability.id} refused at redemption`,
            metadata: { reasons: authorization.reasons.join(",") },
            occurredAt: now,
          }),
        ]);

        return {
          ok: false as const,
          error: {
            code: "CAPABILITY_DENIED" as const,
            message: "Capability does not authorize this execution",
            details: { reasons: authorization.reasons },
          },
        };
      }

      const events: AuditEvent[] = [];
      let nextRequest = this.#applyTransition(
        request,
        "START_EXECUTION",
        input.actor,
        now,
        events,
      );

      const result = await this.#connector.execute({
        capability,
        amountMinor: request.input.amountMinor,
        currency: request.input.currency,
        counterpartyId: request.input.counterpartyId,
        idempotencyKey: input.idempotencyKey,
        requestedAt: now,
      });

      const receipt = ExecutionReceiptSchema.parse({
        id: this.#newId("rcp"),
        capabilityId: capability.id,
        actionRequestId: request.id,
        agentId: input.agentId,
        connectorId: this.#connector.connectorId,
        idempotencyKey: input.idempotencyKey,
        status: result.outcome,
        amountMinor: request.input.amountMinor,
        currency: request.input.currency,
        counterpartyId: request.input.counterpartyId,
        providerReference:
          result.outcome === "succeeded" ? result.externalReference : undefined,
        failureReason:
          result.outcome === "failed" ? result.failureMessage : undefined,
        executedAt: now,
      });

      const usesRemaining = capability.usesRemaining - 1;
      await this.#store.upsertCapability(
        CapabilityGrantSchema.parse({
          ...capability,
          usesRemaining,
          status: usesRemaining === 0 ? "consumed" : capability.status,
        }),
      );

      nextRequest = this.#applyTransition(
        nextRequest,
        result.outcome === "succeeded" ? "MARK_SUCCEEDED" : "MARK_FAILED",
        input.actor,
        now,
        events,
      );

      if (result.outcome === "succeeded") {
        await this.#anchorDecision(nextRequest, policy, "executed", events, now);
      }

      await this.#store.appendReceipt(receipt);
      await this.#store.upsertActionRequest(nextRequest);
      await this.#store.appendAuditEvents(events);

      return { ok: true as const, value: { receipt, request: nextRequest } };
    });
  }

  /** Withdraws authority immediately, whether or not it has been used. */
  async revokeCapability(input: {
    capabilityId: string;
    actor: Actor;
    reason: string;
  }): Promise<AuthorityResult<{ capability: CapabilityGrant }>> {
    return this.#store.runExclusive(async () => {
      const capability = await this.#store.getCapability(input.capabilityId);

      if (!capability) {
        return {
          ok: false as const,
          error: {
            code: "CAPABILITY_NOT_FOUND" as const,
            message: "Unknown capability",
          },
        };
      }

      if (capability.status !== "active") {
        return {
          ok: false as const,
          error: {
            code: "INVALID_STATE" as const,
            message: `Cannot revoke a capability that is ${capability.status}`,
          },
        };
      }

      const now = this.#nowIso();
      const revoked = CapabilityGrantSchema.parse({
        ...capability,
        status: "revoked",
        usesRemaining: 0,
        revokedAt: now,
        revokedReason: input.reason,
      });

      await this.#store.upsertCapability(revoked);
      await this.#store.appendAuditEvents([
        createAuditEvent({
          id: this.#newId("evt"),
          organizationId: this.#organizationId,
          actionRequestId: capability.actionRequestId,
          actor: input.actor,
          eventType: "capability.revoked",
          outcome: "denied",
          summary: `Capability ${capability.id} revoked`,
          metadata: { reason: input.reason },
          occurredAt: now,
        }),
      ]);

      return { ok: true as const, value: { capability: revoked } };
    });
  }

  /**
   * Publishes one authority decision to the proof anchor.
   *
   * Only commitments cross this boundary. The amount, the counterparty, the
   * agent and the policy body stay in operator storage; what is anchored is a
   * nullifier that proves this decision happened exactly once under a policy
   * that was registered, and nothing more.
   *
   * A failed anchor never fails the decision. Authority has already been
   * granted or exercised by the time this runs, so pretending otherwise would
   * misrepresent what happened. The failure is written to the ledger instead,
   * where an operator can see it and re-anchor.
   */
  async #anchorDecision(
    request: ActionRequest,
    policy: Policy,
    outcome: "approved" | "executed",
    events: AuditEvent[],
    now: string,
  ): Promise<void> {
    const policyCommitment = buildPolicyCommitment(policy, this.#organizationSecret);
    const decisionNullifier = buildDecisionNullifier({
      secret: this.#organizationSecret,
      organizationId: this.#organizationId,
      actionRequestId: request.id,
      outcome,
    });

    // Registration is idempotent, and re-asserting it here means a policy
    // created after the anchor was first configured is still anchorable.
    await this.#proofAnchor.registerPolicy({
      policyId: policy.id,
      policyCommitment,
    });

    const submission = await this.#proofAnchor.anchorDecision({
      organizationId: this.#organizationId,
      actionRequestId: request.id,
      policyId: policy.id,
      policyCommitment,
      decisionNullifier,
      outcome,
    });

    const anchor = ProofAnchorSchema.parse({
      id: this.#newId("anc"),
      organizationId: this.#organizationId,
      actionRequestId: request.id,
      policyId: policy.id,
      policyCommitment,
      decisionNullifier,
      outcome,
      network: submission.network,
      state: submission.accepted ? submission.state : "failed",
      transactionHash: submission.accepted ? submission.transactionHash : undefined,
      failureReason: submission.accepted ? undefined : submission.reason,
      createdAt: now,
      confirmedAt:
        submission.accepted && submission.state === "confirmed" ? now : undefined,
    });

    await this.#store.appendProofAnchor(anchor);

    events.push(
      createAuditEvent({
        id: this.#newId("evt"),
        organizationId: this.#organizationId,
        actionRequestId: request.id,
        actor: {
          type: "system",
          id: "proof-anchor",
          displayName: "Proof anchor",
        },
        eventType: submission.accepted ? "proof.anchored" : "proof.failed",
        outcome: submission.accepted ? "allowed" : "denied",
        summary: submission.accepted
          ? `Decision anchored to ${anchor.network} as ${anchor.state}`
          : `Decision could not be anchored to ${anchor.network}`,
        metadata: {
          outcome,
          network: anchor.network,
          state: anchor.state,
          decisionNullifier,
          policyCommitment,
          ...(anchor.transactionHash
            ? { transactionHash: anchor.transactionHash }
            : {}),
          ...(anchor.failureReason ? { reason: anchor.failureReason } : {}),
        },
        occurredAt: now,
      }),
    );
  }

  async #committedSpend(policy: Policy, now: string): Promise<number> {
    const spendWindow = policy.constraints.spendWindow;

    if (!spendWindow) return 0;

    const [grants, receipts] = await Promise.all([
      this.#store.listCapabilities(),
      this.#store.listReceipts(),
    ]);

    return computeCommittedSpendMinor({
      grants,
      receipts,
      policyId: policy.id,
      windowStart: windowStartIso(now, spendWindow.windowHours),
      now,
    });
  }

  async #recordCredentialRejection(prefix: string, reason: string): Promise<void> {
    const now = this.#nowIso();

    await this.#store.appendAuditEvents([
      createAuditEvent({
        id: this.#newId("evt"),
        organizationId: this.#organizationId,
        actor: { type: "system", id: "api-gateway", displayName: "API gateway" },
        eventType: "credential.rejected",
        outcome: "denied",
        summary: `Rejected API key ${prefix}`,
        metadata: { prefix, reason },
        occurredAt: now,
      }),
    ]);
  }

  #applyTransition(
    request: ActionRequest,
    event: ActionRequestEventType,
    actor: Actor,
    occurredAt: string,
    sink: AuditEvent[],
  ): ActionRequest {
    const transitioned = transitionActionRequest({
      request,
      event,
      actor,
      organizationId: this.#organizationId,
      auditEventId: this.#newId("evt"),
      occurredAt,
    });

    sink.push(transitioned.auditEvent);

    return transitioned.request;
  }

  #nowIso(): string {
    return this.#now().toISOString();
  }
}

function formatAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}
