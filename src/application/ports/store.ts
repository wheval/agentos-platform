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
import type { AgentBlueprint } from "@/domain/blueprint";

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

  listBlueprints(): Promise<AgentBlueprint[]>;
  getBlueprint(id: string): Promise<AgentBlueprint | null>;
  upsertBlueprint(blueprint: AgentBlueprint): Promise<AgentBlueprint>;

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
  /**
   * Idempotency keys are scoped to the agent that issued them, never global.
   *
   * The scope is part of the signature rather than a check the caller is
   * trusted to remember, because forgetting it is a disclosure bug: a global
   * lookup lets any authenticated agent present another agent's key and be
   * handed that agent's receipt — amount, counterparty and all — before any
   * authorization runs. Agents pick their own keys, so collisions across
   * agents are expected and must resolve to different receipts.
   */
  getReceiptByIdempotencyKey(
    agentId: string,
    key: string,
  ): Promise<ExecutionReceipt | null>;
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
