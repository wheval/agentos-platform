import { AuthorityService } from "@/application/authority-service";
import type {
  AnchorSubmission,
  DecisionAnchorRequest,
  PolicyProofAnchor,
  PolicyRegistration,
} from "@/application/ports/policy-proof";
import {
  ActionRequestSchema,
  AgentSchema,
  ApiKeySchema,
  ApprovalSchema,
  CapabilityGrantSchema,
  ExecutionReceiptSchema,
  PolicySchema,
  type ActionRequest,
  type Agent,
  type ApiKey,
  type Approval,
  type CapabilityGrant,
  type ExecutionReceipt,
  type Policy,
} from "@/domain/schemas";
import {
  InMemoryAgentOsStore,
  type WorkspaceSeed,
} from "@/infrastructure/in-memory-store";
import { SandboxPaymentConnector } from "@/infrastructure/sandbox-payment-connector";
import { generateApiKey } from "@/lib/api-keys";

export const ORG_ID = "org_test";
export const NOW = "2026-07-31T12:00:00.000Z";
export const CONNECTOR_ID = "con_sandbox";

export function isoAt(offsetMinutes: number, from = NOW): string {
  return new Date(new Date(from).getTime() + offsetMinutes * 60_000).toISOString();
}

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

export function buildRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return ActionRequestSchema.parse({
    id: "req_invoice_1048",
    organizationId: ORG_ID,
    type: "capped_payment",
    agentId: "agt_finance",
    policyId: "pol_vendor_payment",
    state: "requested",
    input: buildPaymentInput(),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

export function buildPaymentInput(
  overrides: Partial<ActionRequest["input"]> = {},
): ActionRequest["input"] {
  return {
    amountMinor: 184_200,
    currency: "USD",
    counterpartyId: "cpty_acme",
    counterpartyName: "Acme Cloud",
    resource: "treasury:operating",
    reference: "INV-1048",
    context: "Renewal of the observability contract, approved in the Q3 budget.",
    ...overrides,
  };
}

export function buildApproval(overrides: Partial<Approval> = {}): Approval {
  return ApprovalSchema.parse({
    id: "apr_maya",
    actionRequestId: "req_invoice_1048",
    approverId: "usr_maya",
    approverName: "Maya Chen",
    decision: "approved",
    createdAt: isoAt(1),
    ...overrides,
  });
}

export function buildCapability(
  overrides: Partial<CapabilityGrant> = {},
): CapabilityGrant {
  return CapabilityGrantSchema.parse({
    id: "cap_invoice_1048",
    actionRequestId: "req_invoice_1048",
    policyId: "pol_vendor_payment",
    issuedToAgentId: "agt_finance",
    status: "active",
    scope: {
      actionKind: "capped_payment",
      resource: "treasury:operating",
      amountLimitMinor: 184_200,
      currency: "USD",
      counterpartyId: "cpty_acme",
    },
    maxUses: 1,
    usesRemaining: 1,
    issuedAt: isoAt(2),
    expiresAt: isoAt(7),
    ...overrides,
  });
}

export function buildReceipt(
  overrides: Partial<ExecutionReceipt> = {},
): ExecutionReceipt {
  return ExecutionReceiptSchema.parse({
    id: "rcp_invoice_1048",
    capabilityId: "cap_invoice_1048",
    actionRequestId: "req_invoice_1048",
    agentId: "agt_finance",
    connectorId: CONNECTOR_ID,
    idempotencyKey: "idem-invoice-1048",
    status: "succeeded",
    amountMinor: 184_200,
    currency: "USD",
    counterpartyId: "cpty_acme",
    providerReference: "sbx_1048",
    executedAt: isoAt(3),
    ...overrides,
  });
}

/** Records what it was asked to anchor without pretending a chain exists. */
export class RecordingProofAnchor implements PolicyProofAnchor {
  readonly network = "local" as const;
  readonly status = "ready" as const;
  readonly description = "Test anchor";
  readonly registrations: PolicyRegistration[] = [];
  readonly decisions: DecisionAnchorRequest[] = [];

  constructor(private readonly accepted = true) {}

  async registerPolicy(
    registration: PolicyRegistration,
  ): Promise<AnchorSubmission> {
    this.registrations.push(registration);

    return this.#respond();
  }

  async anchorDecision(request: DecisionAnchorRequest): Promise<AnchorSubmission> {
    this.decisions.push(request);

    return this.#respond();
  }

  #respond(): AnchorSubmission {
    return this.accepted
      ? { accepted: true, network: "local", state: "recorded" }
      : { accepted: false, network: "local", reason: "Anchor unavailable" };
  }
}

export type TestHarness = {
  service: AuthorityService;
  store: InMemoryAgentOsStore;
  anchor: RecordingProofAnchor;
  agent: Agent;
  policy: Policy;
  apiKeySecret: string;
  /** Moves the harness clock forward for the next service call. */
  advance(minutes: number): void;
};

export function buildHarness(
  options: {
    agent?: Agent;
    /** Extra agents sharing the workspace, for cross-tenant isolation tests. */
    extraAgents?: Agent[];
    policy?: Policy;
    anchorAccepted?: boolean;
    seedRequests?: ActionRequest[];
    seedCapabilities?: CapabilityGrant[];
    seedReceipts?: ExecutionReceipt[];
  } = {},
): TestHarness {
  const agent = options.agent ?? buildAgent();
  const policy = options.policy ?? buildPolicy();
  const generated = generateApiKey();

  const apiKey: ApiKey = ApiKeySchema.parse({
    id: "key_finance",
    agentId: agent.id,
    name: `${agent.name} key`,
    prefix: generated.prefix,
    secretHash: generated.secretHash,
    createdAt: NOW,
  });

  const seed: WorkspaceSeed = {
    agents: [agent, ...(options.extraAgents ?? [])],
    policies: [policy],
    actionRequests: options.seedRequests ?? [],
    approvals: [],
    capabilities: options.seedCapabilities ?? [],
    receipts: options.seedReceipts ?? [],
    auditEvents: [],
    handoffs: [],
    connectors: [
      {
        id: CONNECTOR_ID,
        name: "Sandbox rail",
        kind: "sandbox_payment",
        status: "active",
        description: "Deterministic simulator. Settles nothing.",
      },
    ],
    apiKeys: [apiKey],
    proofAnchors: [],
  };

  const store = new InMemoryAgentOsStore(seed);
  const anchor = new RecordingProofAnchor(options.anchorAccepted ?? true);

  let cursor = new Date(NOW).getTime();
  let sequence = 0;

  const service = new AuthorityService({
    store,
    connector: new SandboxPaymentConnector({ connectorId: CONNECTOR_ID }),
    organizationId: ORG_ID,
    proofAnchor: anchor,
    organizationSecret: "test-organization-secret",
    now: () => new Date(cursor),
    newId: (prefix) => `${prefix}_${(sequence += 1).toString().padStart(4, "0")}`,
  });

  return {
    service,
    store,
    anchor,
    agent,
    policy,
    apiKeySecret: generated.secret,
    advance(minutes: number) {
      cursor += minutes * 60_000;
    },
  };
}

/** Narrows an `AuthorityResult` and fails loudly with the error code if not ok. */
export function expectOk<T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got ${result.error.code}: ${result.error.message}`);
  }

  return result.value;
}
