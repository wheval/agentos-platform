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

/**
 * Persistence boundary for the control plane.
 *
 * Everything above this port is pure domain and application logic, so the
 * storage engine can change without touching policy semantics. The shipped
 * adapter is in-memory and therefore ephemeral; a durable adapter is the next
 * infrastructure change and implements this same interface.
 *
 * Every method is asynchronous on purpose. A database-backed adapter cannot be
 * synchronous, and pretending otherwise now would force a rewrite of every
 * caller later.
 */
export interface AgentOsStore {
  /**
   * Runs a callback with exclusive access to the store.
   *
   * Authority decisions read spend history and then write a grant. Without
   * serialization, two concurrent requests could each observe the same
   * remaining budget and both be approved. The in-memory adapter serializes on
   * a promise chain; a SQL adapter would use a serializable transaction.
   */
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;

  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  upsertAgent(agent: Agent): Promise<Agent>;

  listPolicies(): Promise<Policy[]>;
  getPolicy(id: string): Promise<Policy | null>;
  upsertPolicy(policy: Policy): Promise<Policy>;

  listActionRequests(): Promise<ActionRequest[]>;
  getActionRequest(id: string): Promise<ActionRequest | null>;
  upsertActionRequest(request: ActionRequest): Promise<ActionRequest>;

  listApprovals(): Promise<Approval[]>;
  listApprovalsForRequest(actionRequestId: string): Promise<Approval[]>;
  appendApproval(approval: Approval): Promise<Approval>;

  listCapabilities(): Promise<CapabilityGrant[]>;
  getCapability(id: string): Promise<CapabilityGrant | null>;
  upsertCapability(capability: CapabilityGrant): Promise<CapabilityGrant>;

  listReceipts(): Promise<ExecutionReceipt[]>;
  getReceiptByIdempotencyKey(key: string): Promise<ExecutionReceipt | null>;
  appendReceipt(receipt: ExecutionReceipt): Promise<ExecutionReceipt>;

  listAuditEvents(): Promise<AuditEvent[]>;
  appendAuditEvents(events: AuditEvent[]): Promise<void>;

  listHandoffs(): Promise<AgentHandoff[]>;
  appendHandoff(handoff: AgentHandoff): Promise<AgentHandoff>;

  listConnectors(): Promise<Connector[]>;
  getConnector(id: string): Promise<Connector | null>;

  listApiKeys(): Promise<ApiKey[]>;
  getApiKeyByPrefix(prefix: string): Promise<ApiKey | null>;
  upsertApiKey(apiKey: ApiKey): Promise<ApiKey>;

  listProofAnchors(): Promise<ProofAnchor[]>;
  appendProofAnchor(anchor: ProofAnchor): Promise<ProofAnchor>;
}
