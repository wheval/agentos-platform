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
} from "@/domain/schemas";

type EvaluationInput = {
  agent: Agent;
  policy: Policy;
  request: ActionRequest;
  evaluatedAt: string;
};

export function evaluatePaymentPolicy(input: EvaluationInput): PolicyEvaluation {
  const agent = AgentSchema.parse(input.agent);
  const policy = PolicySchema.parse(input.policy);
  const request = ActionRequestSchema.parse(input.request);
  const evaluatedAt = new Date(TimestampSchema.parse(input.evaluatedAt));
  const reasonCodes: PolicyEvaluation["reasonCodes"] = [];

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

  const denied = reasonCodes.length > 0;
  const requiresApproval = !denied && policy.approvalRule.threshold > 0;

  return PolicyEvaluationSchema.parse({
    status: denied
      ? "denied"
      : requiresApproval
        ? "requires_approval"
        : "approved",
    reasonCodes: denied
      ? reasonCodes
      : [requiresApproval ? "APPROVAL_REQUIRED" : "POLICY_SATISFIED"],
    requiredApprovals: requiresApproval ? policy.approvalRule.threshold : 0,
    policyId: policy.id,
    policyVersion: policy.version,
    evaluatedAt: evaluatedAt.toISOString(),
  });
}
