import {
  ActionRequestSchema,
  AgentSchema,
  ApprovalSchema,
  CapabilityGrantSchema,
  PolicySchema,
  type ActionRequest,
  type Agent,
  type Approval,
  type CapabilityGrant,
  type Policy,
} from "@/domain/schemas";

export const NOW = "2026-07-31T12:00:00.000Z";

export function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return AgentSchema.parse({
    id: "agt_finance",
    name: "Finance operator",
    jobDescription: "Prepare bounded vendor payments.",
    managerId: "usr_maya",
    managerName: "Maya Chen",
    status: "active",
    riskTier: "high",
    permissions: ["capped_payment"],
    lastActiveAt: NOW,
    ...overrides,
  });
}

export function buildPolicy(overrides: Partial<Policy> = {}): Policy {
  return PolicySchema.parse({
    id: "pol_vendor_payment",
    name: "Approved vendor payment",
    description: "Caps payments to allowlisted vendors.",
    version: 3,
    actionKind: "capped_payment",
    status: "active",
    constraints: {
      currency: "USD",
      maxAmountMinor: 250_000,
      approvedCounterpartyIds: ["cpty_acme"],
      resource: "treasury:operating",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      capabilityTtlSeconds: 300,
    },
    approvalRule: {
      threshold: 1,
      approverIds: ["usr_maya", "usr_omar"],
    },
    ...overrides,
  });
}

export function buildRequest(
  overrides: Partial<ActionRequest> = {},
): ActionRequest {
  return ActionRequestSchema.parse({
    id: "req_invoice_1048",
    type: "capped_payment",
    agentId: "agt_finance",
    policyId: "pol_vendor_payment",
    state: "requested",
    input: {
      amountMinor: 184_200,
      currency: "USD",
      counterpartyId: "cpty_acme",
      counterpartyName: "Acme Cloud",
      resource: "treasury:operating",
      reference: "INV-1048",
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

export function buildApproval(overrides: Partial<Approval> = {}): Approval {
  return ApprovalSchema.parse({
    id: "apr_maya",
    actionRequestId: "req_invoice_1048",
    approverId: "usr_maya",
    approverName: "Maya Chen",
    decision: "approved",
    createdAt: "2026-07-31T12:01:00.000Z",
    ...overrides,
  });
}

export function buildCapability(
  overrides: Partial<CapabilityGrant> = {},
): CapabilityGrant {
  return CapabilityGrantSchema.parse({
    id: "cap_invoice_1048",
    actionRequestId: "req_invoice_1048",
    issuedToAgentId: "agt_finance",
    status: "active",
    scope: {
      actionKind: "capped_payment",
      resource: "treasury:operating",
      amountLimitMinor: 184_200,
      currency: "USD",
      counterpartyId: "cpty_acme",
    },
    issuedAt: "2026-07-31T12:02:00.000Z",
    expiresAt: "2026-07-31T12:07:00.000Z",
    ...overrides,
  });
}
