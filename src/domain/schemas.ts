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
      })
      .strict(),
    approvalRule: z
      .object({
        threshold: z.number().int().min(0).max(5),
        approverIds: z.array(id("usr")).max(10),
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
  });

export const PaymentActionInputSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    currency: CurrencySchema,
    counterpartyId: id("cpty"),
    counterpartyName: z.string().min(1),
    resource: z.string().min(1),
    reference: z.string().min(1).max(140),
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
  "APPROVAL_REQUIRED",
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
  })
  .strict();

export const ActionRequestSchema = z
  .object({
    id: id("req"),
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

export const CapabilityGrantSchema = z
  .object({
    id: id("cap"),
    actionRequestId: id("req"),
    issuedToAgentId: id("agt"),
    status: z.enum(["active", "consumed", "revoked"]),
    scope: z
      .object({
        actionKind: ActionKindSchema,
        resource: z.string().min(1),
        amountLimitMinor: z.number().int().positive(),
        currency: CurrencySchema,
        counterpartyId: id("cpty"),
      })
      .strict(),
    issuedAt: TimestampSchema,
    expiresAt: TimestampSchema,
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
  });

const AuditMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const AuditEventSchema = z
  .object({
    id: id("evt"),
    organizationId: id("org"),
    actionRequestId: id("req").optional(),
    actor: ActorSchema,
    eventType: z.enum([
      "action.requested",
      "action.state_changed",
      "policy.evaluated",
      "approval.recorded",
      "capability.issued",
      "capability.revoked",
      "action.executed",
      "handoff.authorized",
    ]),
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
export type Policy = z.infer<typeof PolicySchema>;
export type PaymentActionInput = z.infer<typeof PaymentActionInputSchema>;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionRequestState = z.infer<typeof ActionRequestStateSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type PolicyEvaluation = z.infer<typeof PolicyEvaluationSchema>;
export type CapabilityGrant = z.infer<typeof CapabilityGrantSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;
export type Actor = z.infer<typeof ActorSchema>;
