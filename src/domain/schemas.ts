import { z } from "zod";

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-z0-9][a-z0-9_-]*$`));

export const TimestampSchema = z.string().datetime({ offset: true });
export const CurrencySchema = z.enum(["USD", "EUR", "GBP"]);
export const ActionKindSchema = z.enum(["capped_payment"]);
export const ActorSchema = z
  .object({
    type: z.enum(["agent", "human", "system"]),
    id: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

export const AgentSchema = z
  .object({
    id: id("agt"),
    name: z.string().min(1),
    jobDescription: z.string().min(1),
    managerId: id("usr"),
    managerName: z.string().min(1),
    status: z.enum(["active", "paused"]),
    riskTier: z.enum(["low", "medium", "high"]),
    permissions: z.array(ActionKindSchema),
    lastActiveAt: TimestampSchema,
  })
  .strict();

/**
 * A rolling spend ceiling, the control both PayBox and Stripe lead with
 * ("under $150 a week"). Evaluated against settled and in-flight authority so a
 * burst of concurrent requests cannot collectively breach the cap.
 */
export const SpendWindowSchema = z
  .object({
    windowHours: z.number().int().min(1).max(8760),
    maxAmountMinor: z.number().int().positive(),
  })
  .strict();

export const PolicySchema = z
  .object({
    id: id("pol"),
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.number().int().positive(),
    actionKind: ActionKindSchema,
    status: z.enum(["active", "draft", "retired"]),
    constraints: z
      .object({
        currency: CurrencySchema,
        maxAmountMinor: z.number().int().positive(),
        approvedCounterpartyIds: z.array(id("cpty")).min(1),
        resource: z.string().min(1),
        validFrom: TimestampSchema,
        validUntil: TimestampSchema,
        capabilityTtlSeconds: z.number().int().min(30).max(900),
        spendWindow: SpendWindowSchema.optional(),
      })
      .strict(),
    approvalRule: z
      .object({
        threshold: z.number().int().min(0).max(5),
        approverIds: z.array(id("usr")).max(10),
        /**
         * Standing authority. Requests strictly below this amount skip human
         * review; everything at or above it still collects `threshold`
         * approvals. Omit to require approval for every request.
         */
        autoApproveBelowMinor: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.approvalRule.threshold > policy.approvalRule.approverIds.length) {
      context.addIssue({
        code: "custom",
        message: "Approval threshold cannot exceed the approver pool",
        path: ["approvalRule", "threshold"],
      });
    }

    if (
      new Date(policy.constraints.validUntil).getTime() <=
      new Date(policy.constraints.validFrom).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "Policy validity end must be after its start",
        path: ["constraints", "validUntil"],
      });
    }

    const autoApproveBelow = policy.approvalRule.autoApproveBelowMinor;
    if (
      autoApproveBelow !== undefined &&
      autoApproveBelow > policy.constraints.maxAmountMinor
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Standing authority cannot exceed the per-transaction limit it sits inside",
        path: ["approvalRule", "autoApproveBelowMinor"],
      });
    }

    const spendWindow = policy.constraints.spendWindow;
    if (
      spendWindow &&
      spendWindow.maxAmountMinor < policy.constraints.maxAmountMinor
    ) {
      context.addIssue({
        code: "custom",
        message: "Spend window ceiling cannot be below the per-transaction limit",
        path: ["constraints", "spendWindow", "maxAmountMinor"],
      });
    }
  });

export const PaymentActionInputSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currency: CurrencySchema,
    counterpartyId: id("cpty"),
    counterpartyName: z.string().min(1),
    resource: z.string().min(1),
    reference: z.string().min(1).max(140),
    /**
     * Why the agent believes this spend is warranted, in language the approving
     * human can act on. Approval without context is rubber-stamping.
     */
    context: z.string().min(1).max(500),
  })
  .strict();

export const ActionRequestStateSchema = z.enum([
  "requested",
  "evaluating",
  "denied",
  "pending_approval",
  "approved",
  "capability_issued",
  "executing",
  "succeeded",
  "failed",
  "expired",
  "cancelled",
]);

export const PolicyReasonCodeSchema = z.enum([
  "AGENT_INACTIVE",
  "AGENT_NOT_AUTHORIZED",
  "POLICY_INACTIVE",
  "POLICY_NOT_YET_ACTIVE",
  "POLICY_EXPIRED",
  "REQUEST_AGENT_MISMATCH",
  "REQUEST_POLICY_MISMATCH",
  "CURRENCY_NOT_ALLOWED",
  "AMOUNT_EXCEEDS_LIMIT",
  "COUNTERPARTY_NOT_ALLOWED",
  "RESOURCE_NOT_ALLOWED",
  "SPEND_WINDOW_EXCEEDED",
  "APPROVAL_REQUIRED",
  "AUTO_APPROVED_UNDER_THRESHOLD",
  "POLICY_SATISFIED",
]);

export const PolicyEvaluationSchema = z
  .object({
    status: z.enum(["denied", "requires_approval", "approved"]),
    reasonCodes: z.array(PolicyReasonCodeSchema).min(1),
    requiredApprovals: z.number().int().min(0),
    policyId: id("pol"),
    policyVersion: z.number().int().positive(),
    evaluatedAt: TimestampSchema,
    spendWindow: z
      .object({
        windowHours: z.number().int().positive(),
        maxAmountMinor: z.number().int().positive(),
        priorSpendMinor: z.number().int().min(0),
        projectedSpendMinor: z.number().int().min(0),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ActionRequestSchema = z
  .object({
    id: id("req"),
    organizationId: id("org"),
    type: ActionKindSchema,
    agentId: id("agt"),
    policyId: id("pol"),
    state: ActionRequestStateSchema,
    input: PaymentActionInputSchema,
    policyEvaluation: PolicyEvaluationSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const ApprovalSchema = z
  .object({
    id: id("apr"),
    actionRequestId: id("req"),
    approverId: id("usr"),
    approverName: z.string().min(1),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().min(1).max(500).optional(),
    createdAt: TimestampSchema,
  })
  .strict();

export const CapabilityStatusSchema = z.enum([
  "active",
  "consumed",
  "revoked",
  "expired",
]);

export const CapabilityGrantSchema = z
  .object({
    id: id("cap"),
    actionRequestId: id("req"),
    policyId: id("pol"),
    issuedToAgentId: id("agt"),
    status: CapabilityStatusSchema,
    scope: z
      .object({
        actionKind: ActionKindSchema,
        resource: z.string().min(1),
        amountLimitMinor: z.number().int().positive(),
        currency: CurrencySchema,
        counterpartyId: id("cpty"),
      })
      .strict(),
    maxUses: z.number().int().min(1).max(100),
    usesRemaining: z.number().int().min(0),
    issuedAt: TimestampSchema,
    expiresAt: TimestampSchema,
    revokedAt: TimestampSchema.optional(),
    revokedReason: z.string().min(1).max(280).optional(),
  })
  .strict()
  .superRefine((grant, context) => {
    if (new Date(grant.expiresAt).getTime() <= new Date(grant.issuedAt).getTime()) {
      context.addIssue({
        code: "custom",
        message: "Capability expiry must be after issuance",
        path: ["expiresAt"],
      });
    }

    if (grant.usesRemaining > grant.maxUses) {
      context.addIssue({
        code: "custom",
        message: "Remaining uses cannot exceed the granted maximum",
        path: ["usesRemaining"],
      });
    }
  });

/**
 * The record of an agent actually exercising authority. Receipts are keyed by an
 * idempotency key so a retried call can never settle twice.
 */
export const ExecutionReceiptSchema = z
  .object({
    id: id("rcp"),
    capabilityId: id("cap"),
    actionRequestId: id("req"),
    agentId: id("agt"),
    connectorId: id("con"),
    idempotencyKey: z.string().min(8).max(120),
    status: z.enum(["succeeded", "failed"]),
    amountMinor: z.number().int().positive(),
    currency: CurrencySchema,
    counterpartyId: id("cpty"),
    providerReference: z.string().min(1).max(140).optional(),
    failureReason: z.string().min(1).max(280).optional(),
    executedAt: TimestampSchema,
  })
  .strict();

export const ConnectorSchema = z
  .object({
    id: id("con"),
    name: z.string().min(1),
    kind: z.literal("sandbox_payment"),
    status: z.enum(["active", "disabled"]),
    description: z.string().min(1).max(280),
  })
  .strict();

/**
 * Credential material an agent uses to authenticate against the control plane.
 * Only the SHA-256 digest is retained; the plaintext secret is returned once at
 * creation and is not recoverable afterwards.
 */
export const ApiKeySchema = z
  .object({
    id: id("key"),
    agentId: id("agt"),
    name: z.string().min(1).max(80),
    prefix: z.string().regex(/^aos_sk_[a-f0-9]{8}$/),
    secretHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: TimestampSchema,
    lastUsedAt: TimestampSchema.optional(),
    revokedAt: TimestampSchema.optional(),
  })
  .strict();

/**
 * A decision published to the policy-anchor contract.
 *
 * The anchor carries commitments only. The policy body, the amount, the
 * counterparty and the acting agent stay in encrypted operator storage; the
 * chain learns that *some* registered policy authorized *some* decision, plus a
 * nullifier that makes the decision provably unique.
 */
export const ProofNetworkSchema = z.enum([
  "local",
  "midnight-testnet",
  "midnight-mainnet",
]);

export const ProofAnchorSchema = z
  .object({
    id: id("anc"),
    organizationId: id("org"),
    actionRequestId: id("req"),
    policyId: id("pol"),
    policyCommitment: z.string().regex(/^[a-f0-9]{64}$/),
    decisionNullifier: z.string().regex(/^[a-f0-9]{64}$/),
    outcome: z.enum(["approved", "executed"]),
    network: ProofNetworkSchema,
    state: z.enum(["recorded", "submitted", "confirmed", "failed"]),
    transactionHash: z.string().min(1).max(140).optional(),
    failureReason: z.string().min(1).max(280).optional(),
    createdAt: TimestampSchema,
    confirmedAt: TimestampSchema.optional(),
  })
  .strict();

const AuditMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const AuditEventTypeSchema = z.enum([
  "action.requested",
  "action.state_changed",
  "policy.evaluated",
  "approval.recorded",
  "capability.issued",
  "capability.revoked",
  "action.executed",
  "handoff.authorized",
  "credential.issued",
  "credential.revoked",
  "credential.rejected",
  "policy.registered",
  "proof.anchored",
  "proof.failed",
]);

export const AuditEventSchema = z
  .object({
    id: id("evt"),
    organizationId: id("org"),
    actionRequestId: id("req").optional(),
    actor: ActorSchema,
    eventType: AuditEventTypeSchema,
    outcome: z.enum(["info", "allowed", "denied", "failed"]),
    summary: z.string().min(1).max(280),
    metadata: z.record(z.string(), AuditMetadataValueSchema),
    occurredAt: TimestampSchema,
  })
  .strict();

export const AgentHandoffSchema = z
  .object({
    id: id("hnd"),
    fromAgentId: id("agt"),
    toAgentId: id("agt"),
    actionRequestId: id("req").optional(),
    state: z.enum(["proposed", "authorized", "delivered", "rejected", "expired"]),
    dataClassification: z.enum(["internal", "confidential", "restricted"]),
    purpose: z.string().min(1).max(280),
    delegatedCapabilityId: id("cap").optional(),
    createdAt: TimestampSchema,
    expiresAt: TimestampSchema,
  })
  .strict()
  .superRefine((handoff, context) => {
    if (handoff.fromAgentId === handoff.toAgentId) {
      context.addIssue({
        code: "custom",
        message: "A handoff must target a different agent",
        path: ["toAgentId"],
      });
    }
  });

export type Agent = z.infer<typeof AgentSchema>;
export type Currency = z.infer<typeof CurrencySchema>;
export type Policy = z.infer<typeof PolicySchema>;
export type SpendWindow = z.infer<typeof SpendWindowSchema>;
export type PaymentActionInput = z.infer<typeof PaymentActionInputSchema>;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionRequestState = z.infer<typeof ActionRequestStateSchema>;
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type PolicyEvaluation = z.infer<typeof PolicyEvaluationSchema>;
export type PolicyReasonCode = z.infer<typeof PolicyReasonCodeSchema>;
export type CapabilityGrant = z.infer<typeof CapabilityGrantSchema>;
export type ExecutionReceipt = z.infer<typeof ExecutionReceiptSchema>;
export type Connector = z.infer<typeof ConnectorSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export type ProofAnchor = z.infer<typeof ProofAnchorSchema>;
export type ProofNetwork = z.infer<typeof ProofNetworkSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;
export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;
export type Actor = z.infer<typeof ActorSchema>;
