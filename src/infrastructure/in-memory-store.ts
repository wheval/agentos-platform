import type { AgentOsStore } from "@/application/ports/store";
import type {
  ActionRequest,
  Agent,
  AgentHandoff,
  ApiKey,
  Approval,
  AuditEvent,
  CapabilityGrant,
  Connector,
  ExecutionReceipt,
  Policy,
  ProofAnchor,
} from "@/domain/schemas";

export type WorkspaceSeed = {
  agents: Agent[];
  policies: Policy[];
  actionRequests: ActionRequest[];
  approvals: Approval[];
  capabilities: CapabilityGrant[];
  receipts: ExecutionReceipt[];
  auditEvents: AuditEvent[];
  handoffs: AgentHandoff[];
  connectors: Connector[];
  apiKeys: ApiKey[];
  proofAnchors: ProofAnchor[];
};

/**
 * In-memory implementation of the persistence port.
 *
 * State lives in the server process and is lost on restart. That is a
 * deliberate, documented limitation of this milestone rather than an oversight:
 * it keeps the product runnable and CI infrastructure-free while the storage
 * boundary is exercised by real code. Swapping in a durable adapter means
 * implementing `AgentOsStore` and changing one wiring module.
 */
export class InMemoryAgentOsStore implements AgentOsStore {
  #agents: Agent[];
  #policies: Policy[];
  #actionRequests: ActionRequest[];
  #approvals: Approval[];
  #capabilities: CapabilityGrant[];
  #receipts: ExecutionReceipt[];
  #auditEvents: AuditEvent[];
  #handoffs: AgentHandoff[];
  #connectors: Connector[];
  #apiKeys: ApiKey[];
  #proofAnchors: ProofAnchor[];
  #lock: Promise<unknown> = Promise.resolve();

  constructor(seed: WorkspaceSeed) {
    this.#agents = [...seed.agents];
    this.#policies = [...seed.policies];
    this.#actionRequests = [...seed.actionRequests];
    this.#approvals = [...seed.approvals];
    this.#capabilities = [...seed.capabilities];
    this.#receipts = [...seed.receipts];
    this.#auditEvents = [...seed.auditEvents];
    this.#handoffs = [...seed.handoffs];
    this.#connectors = [...seed.connectors];
    this.#apiKeys = [...seed.apiKeys];
    this.#proofAnchors = [...seed.proofAnchors];
  }

  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#lock.then(operation, operation);
    // Keep the chain alive even when an operation rejects, so one failed
    // request cannot deadlock every later one.
    this.#lock = run.catch(() => undefined);

    return run;
  }

  async listAgents(): Promise<Agent[]> {
    return [...this.#agents];
  }

  async getAgent(id: string): Promise<Agent | null> {
    return this.#agents.find((agent) => agent.id === id) ?? null;
  }

  async upsertAgent(agent: Agent): Promise<Agent> {
    this.#agents = upsertById(this.#agents, agent);

    return agent;
  }

  async listPolicies(): Promise<Policy[]> {
    return [...this.#policies];
  }

  async getPolicy(id: string): Promise<Policy | null> {
    return this.#policies.find((policy) => policy.id === id) ?? null;
  }

  async upsertPolicy(policy: Policy): Promise<Policy> {
    this.#policies = upsertById(this.#policies, policy);

    return policy;
  }

  async listActionRequests(): Promise<ActionRequest[]> {
    return [...this.#actionRequests];
  }

  async getActionRequest(id: string): Promise<ActionRequest | null> {
    return this.#actionRequests.find((request) => request.id === id) ?? null;
  }

  async upsertActionRequest(request: ActionRequest): Promise<ActionRequest> {
    this.#actionRequests = upsertById(this.#actionRequests, request);

    return request;
  }

  async listApprovals(): Promise<Approval[]> {
    return [...this.#approvals];
  }

  async listApprovalsForRequest(actionRequestId: string): Promise<Approval[]> {
    return this.#approvals.filter(
      (approval) => approval.actionRequestId === actionRequestId,
    );
  }

  async appendApproval(approval: Approval): Promise<Approval> {
    this.#approvals = [...this.#approvals, approval];

    return approval;
  }

  async listCapabilities(): Promise<CapabilityGrant[]> {
    return [...this.#capabilities];
  }

  async getCapability(id: string): Promise<CapabilityGrant | null> {
    return this.#capabilities.find((grant) => grant.id === id) ?? null;
  }

  async upsertCapability(capability: CapabilityGrant): Promise<CapabilityGrant> {
    this.#capabilities = upsertById(this.#capabilities, capability);

    return capability;
  }

  async listReceipts(): Promise<ExecutionReceipt[]> {
    return [...this.#receipts];
  }

  async getReceiptByIdempotencyKey(
    key: string,
  ): Promise<ExecutionReceipt | null> {
    return (
      this.#receipts.find((receipt) => receipt.idempotencyKey === key) ?? null
    );
  }

  async appendReceipt(receipt: ExecutionReceipt): Promise<ExecutionReceipt> {
    this.#receipts = [...this.#receipts, receipt];

    return receipt;
  }

  async listAuditEvents(): Promise<AuditEvent[]> {
    return [...this.#auditEvents];
  }

  async appendAuditEvents(events: AuditEvent[]): Promise<void> {
    this.#auditEvents = [...this.#auditEvents, ...events];
  }

  async listHandoffs(): Promise<AgentHandoff[]> {
    return [...this.#handoffs];
  }

  async appendHandoff(handoff: AgentHandoff): Promise<AgentHandoff> {
    this.#handoffs = [...this.#handoffs, handoff];

    return handoff;
  }

  async listConnectors(): Promise<Connector[]> {
    return [...this.#connectors];
  }

  async getConnector(id: string): Promise<Connector | null> {
    return this.#connectors.find((connector) => connector.id === id) ?? null;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    return [...this.#apiKeys];
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKey | null> {
    return this.#apiKeys.find((apiKey) => apiKey.prefix === prefix) ?? null;
  }

  async upsertApiKey(apiKey: ApiKey): Promise<ApiKey> {
    this.#apiKeys = upsertById(this.#apiKeys, apiKey);
    return apiKey;
  }

  async listProofAnchors(): Promise<ProofAnchor[]> {
    return [...this.#proofAnchors];
  }

  async appendProofAnchor(anchor: ProofAnchor): Promise<ProofAnchor> {
    this.#proofAnchors = [...this.#proofAnchors, anchor];
    return anchor;
  }
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);

  if (index === -1) return [...items, next];

  const copy = [...items];
  copy[index] = next;

  return copy;
}
