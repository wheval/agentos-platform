import {
  ActionRequestSchema,
  AgentSchema,
  PolicyEvaluationSchema,
  PolicySchema,
  TimestampSchema,
  type ActionRequest,
  type Agent,
  type Policy,
  type PolicyEvaluation,
  type PolicyReasonCode,
} from "@/domain/schemas";

export type EvaluationInput = {
  agent: Agent;
  policy: Policy;
  request: ActionRequest;
  evaluatedAt: string;
  /**
   * Authority already committed under this policy inside the rolling window,
   * counting both settled executions and live capability grants. Passing
   * committed rather than settled spend is deliberate: a capability that has
   * been issued but not yet redeemed is still authority the agent holds.
   */
  windowSpendMinor?: number;
};

/**
 * Decides whether an agent may act, and whether a human must sign off first.
 *
 * The evaluator is deterministic and side-effect free. It never reads a clock,
 * never touches storage, and never sees credential material — every input is
 * supplied by the caller so the same decision can be replayed and, later,
 * proved without disclosing the underlying data.
 */
export function evaluatePaymentPolicy(input: EvaluationInput): PolicyEvaluation {
  const agent = AgentSchema.parse(input.agent);
  const policy = PolicySchema.parse(input.policy);
  const request = ActionRequestSchema.parse(input.request);
  const evaluatedAt = new Date(TimestampSchema.parse(input.evaluatedAt));
  const priorSpendMinor = Math.max(0, Math.trunc(input.windowSpendMinor ?? 0));
  const reasonCodes: PolicyReasonCode[] = [];

  if (agent.status !== "active") reasonCodes.push("AGENT_INACTIVE");
  if (!agent.permissions.includes(request.type)) {
    reasonCodes.push("AGENT_NOT_AUTHORIZED");
  }
  if (policy.status !== "active") reasonCodes.push("POLICY_INACTIVE");
  if (request.agentId !== agent.id) reasonCodes.push("REQUEST_AGENT_MISMATCH");
  if (request.policyId !== policy.id) reasonCodes.push("REQUEST_POLICY_MISMATCH");
  if (evaluatedAt < new Date(policy.constraints.validFrom)) {
    reasonCodes.push("POLICY_NOT_YET_ACTIVE");
  }
  if (evaluatedAt >= new Date(policy.constraints.validUntil)) {
    reasonCodes.push("POLICY_EXPIRED");
  }
  if (request.input.currency !== policy.constraints.currency) {
    reasonCodes.push("CURRENCY_NOT_ALLOWED");
  }
  if (request.input.amountMinor > policy.constraints.maxAmountMinor) {
    reasonCodes.push("AMOUNT_EXCEEDS_LIMIT");
  }
  if (
    !policy.constraints.approvedCounterpartyIds.includes(
      request.input.counterpartyId,
    )
  ) {
    reasonCodes.push("COUNTERPARTY_NOT_ALLOWED");
  }
  if (request.input.resource !== policy.constraints.resource) {
    reasonCodes.push("RESOURCE_NOT_ALLOWED");
  }

  const spendWindow = policy.constraints.spendWindow;
  const projectedSpendMinor = priorSpendMinor + request.input.amountMinor;
  if (spendWindow && projectedSpendMinor > spendWindow.maxAmountMinor) {
    reasonCodes.push("SPEND_WINDOW_EXCEEDED");
  }

  const windowSummary = spendWindow
    ? {
        windowHours: spendWindow.windowHours,
        maxAmountMinor: spendWindow.maxAmountMinor,
        priorSpendMinor,
        projectedSpendMinor,
      }
    : undefined;

  if (reasonCodes.length > 0) {
    return PolicyEvaluationSchema.parse({
      status: "denied",
      reasonCodes,
      requiredApprovals: 0,
      policyId: policy.id,
      policyVersion: policy.version,
      evaluatedAt: evaluatedAt.toISOString(),
      spendWindow: windowSummary,
    });
  }

  const { threshold, autoApproveBelowMinor } = policy.approvalRule;
  const withinStandingAuthority =
    autoApproveBelowMinor !== undefined &&
    request.input.amountMinor < autoApproveBelowMinor;
  const requiresApproval = threshold > 0 && !withinStandingAuthority;

  const settledReason: PolicyReasonCode = requiresApproval
    ? "APPROVAL_REQUIRED"
    : withinStandingAuthority
      ? "AUTO_APPROVED_UNDER_THRESHOLD"
      : "POLICY_SATISFIED";

  return PolicyEvaluationSchema.parse({
    status: requiresApproval ? "requires_approval" : "approved",
    reasonCodes: [settledReason],
    requiredApprovals: requiresApproval ? threshold : 0,
    policyId: policy.id,
    policyVersion: policy.version,
    evaluatedAt: evaluatedAt.toISOString(),
    spendWindow: windowSummary,
  });
}
