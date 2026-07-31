import type { WorkspaceSeed } from "@/infrastructure/in-memory-store";
import {
  ActionRequestSchema,
  AgentHandoffSchema,
  AgentSchema,
  ApiKeySchema,
  ApprovalSchema,
  AuditEventSchema,
  CapabilityGrantSchema,
  ConnectorSchema,
  ExecutionReceiptSchema,
  PolicySchema,
} from "@/domain/schemas";
import { AgentBlueprintSchema } from "@/domain/blueprint";
import { generateApiKey } from "@/lib/api-keys";

export const DEMO_ORGANIZATION_ID = "org_northwind";
export const DEMO_ORGANIZATION_NAME = "Northwind Robotics";
export const SANDBOX_CONNECTOR_ID = "con_sandbox";

export type BootstrapApiKey = {
  agentId: string;
  agentName: string;
  /** Plaintext, held only in memory, shown once in the console. */
  secret: string;
};

export type SeededWorkspace = {
  seed: WorkspaceSeed;
  bootstrapApiKeys: BootstrapApiKey[];
};

/**
 * Builds a demonstration workspace.
 *
 * Every record is fabricated. No real organization, vendor, person or payment
 * is represented here, and the sandbox connector settles nothing. Timestamps are
 * derived from the boot time rather than hard-coded so the demo never presents
 * expired policies or stale capabilities as if they were current.
 */
export function buildSeededWorkspace(now = new Date()): SeededWorkspace {
  const at = (minutes: number) =>
    new Date(now.getTime() + minutes * 60_000).toISOString();
  const days = (count: number) => count * 24 * 60;

  const agents = [
    {
      id: "agt_finance",
      name: "Finance Agent",
      jobDescription:
        "Reconciles supplier invoices and prepares bounded vendor payments for review.",
      managerId: "usr_maya",
      managerName: "Maya Chen",
      status: "active",
      riskTier: "high",
      permissions: ["capped_payment"],
      lastActiveAt: at(-8),
    },
    {
      id: "agt_research",
      name: "Research Agent",
      jobDescription:
        "Buys metered search, scraping and inference credits while gathering market evidence.",
      managerId: "usr_omar",
      managerName: "Omar Haddad",
      status: "active",
      riskTier: "low",
      permissions: ["capped_payment"],
      lastActiveAt: at(-3),
    },
    {
      id: "agt_vendor",
      name: "Vendor Agent",
      jobDescription:
        "Verifies counterparty identity and payment readiness. Holds no spending authority.",
      managerId: "usr_omar",
      managerName: "Omar Haddad",
      status: "active",
      riskTier: "medium",
      permissions: [],
      lastActiveAt: at(-21),
    },
    {
      id: "agt_operations",
      name: "Operations Agent",
      jobDescription:
        "Coordinates approved SaaS renewals and operational workflows.",
      managerId: "usr_maya",
      managerName: "Maya Chen",
      status: "active",
      riskTier: "medium",
      permissions: ["capped_payment"],
      lastActiveAt: at(-46),
    },
    {
      id: "agt_deployment",
      name: "Deployment Agent",
      jobDescription:
        "Prepares staging releases. Suspended pending a permissions review.",
      managerId: "usr_nora",
      managerName: "Nora Singh",
      status: "paused",
      riskTier: "high",
      permissions: [],
      lastActiveAt: at(-days(1)),
    },
  ].map((agent) => AgentSchema.parse(agent));

  const policies = [
    {
      id: "pol_vendor_payment",
      name: "Approved vendor payment",
      description:
        "Allowlisted operating-account payments with two-person review above the standing limit.",
      version: 3,
      actionKind: "capped_payment",
      status: "active",
      constraints: {
        currency: "USD",
        maxAmountMinor: 500_000,
        approvedCounterpartyIds: ["cpty_acme", "cpty_stripe", "cpty_figma"],
        resource: "treasury:operating",
        validFrom: at(-days(30)),
        validUntil: at(days(60)),
        capabilityTtlSeconds: 300,
        spendWindow: { windowHours: 168, maxAmountMinor: 2_000_000 },
      },
      approvalRule: {
        threshold: 2,
        approverIds: ["usr_maya", "usr_omar", "usr_nora"],
        autoApproveBelowMinor: 25_000,
      },
    },
    {
      id: "pol_research_tools",
      name: "Research tooling spend",
      description:
        "Metered search and scraping credits. Autonomous under five dollars, capped at one hundred fifty dollars a week.",
      version: 2,
      actionKind: "capped_payment",
      status: "active",
      constraints: {
        currency: "USD",
        maxAmountMinor: 2_000,
        approvedCounterpartyIds: ["cpty_serpstack", "cpty_scrapehub"],
        resource: "treasury:research",
        validFrom: at(-days(14)),
        validUntil: at(days(75)),
        capabilityTtlSeconds: 120,
        spendWindow: { windowHours: 168, maxAmountMinor: 15_000 },
      },
      approvalRule: {
        threshold: 1,
        approverIds: ["usr_omar", "usr_maya"],
        autoApproveBelowMinor: 500,
      },
    },
    {
      id: "pol_incident_payment",
      name: "Incident response payment",
      description:
        "Small emergency payments to pre-vetted response vendors, single approver.",
      version: 1,
      actionKind: "capped_payment",
      status: "active",
      constraints: {
        currency: "USD",
        maxAmountMinor: 75_000,
        approvedCounterpartyIds: ["cpty_pager"],
        resource: "treasury:incident",
        validFrom: at(-days(20)),
        validUntil: at(days(20)),
        capabilityTtlSeconds: 120,
      },
      approvalRule: { threshold: 1, approverIds: ["usr_maya", "usr_nora"] },
    },
    {
      id: "pol_marketplace_pilot",
      name: "Marketplace pilot",
      description: "Proposed low-value marketplace settlement policy, not yet live.",
      version: 1,
      actionKind: "capped_payment",
      status: "draft",
      constraints: {
        currency: "USD",
        maxAmountMinor: 25_000,
        approvedCounterpartyIds: ["cpty_marketplace"],
        resource: "treasury:pilot",
        validFrom: at(days(14)),
        validUntil: at(days(90)),
        capabilityTtlSeconds: 60,
      },
      approvalRule: { threshold: 1, approverIds: ["usr_omar"] },
    },
  ].map((policy) => PolicySchema.parse(policy));

  const evaluation = (
    status: "approved" | "requires_approval" | "denied",
    reasonCodes: string[],
    policyId: string,
    policyVersion: number,
    evaluatedAt: string,
    requiredApprovals = 0,
  ) => ({ status, reasonCodes, requiredApprovals, policyId, policyVersion, evaluatedAt });

  const actionRequests = [
    {
      id: "req_acme_invoice",
      organizationId: DEMO_ORGANIZATION_ID,
      type: "capped_payment",
      agentId: "agt_finance",
      policyId: "pol_vendor_payment",
      state: "pending_approval",
      input: {
        amountMinor: 420_000,
        currency: "USD",
        counterpartyId: "cpty_acme",
        counterpartyName: "Acme Components",
        resource: "treasury:operating",
        reference: "INV-2291 · Q3 component order",
        context:
          "Invoice INV-2291 matches purchase order PO-8841 and the signed delivery note. Net-30 terms lapse in four days.",
      },
      policyEvaluation: evaluation(
        "requires_approval",
        ["APPROVAL_REQUIRED"],
        "pol_vendor_payment",
        3,
        at(-12),
        2,
      ),
      createdAt: at(-13),
      updatedAt: at(-12),
    },
    {
      id: "req_figma_seats",
      organizationId: DEMO_ORGANIZATION_ID,
      type: "capped_payment",
      agentId: "agt_operations",
      policyId: "pol_vendor_payment",
      state: "approved",
      input: {
        amountMinor: 180_000,
        currency: "USD",
        counterpartyId: "cpty_figma",
        counterpartyName: "Figma",
        resource: "treasury:operating",
        reference: "Design seats renewal",
        context:
          "Twelve design seats renew tomorrow. Seat count matches the current directory export.",
      },
      policyEvaluation: evaluation(
        "requires_approval",
        ["APPROVAL_REQUIRED"],
        "pol_vendor_payment",
        3,
        at(-92),
        2,
      ),
      createdAt: at(-95),
      updatedAt: at(-61),
    },
    {
      id: "req_search_credits",
      organizationId: DEMO_ORGANIZATION_ID,
      type: "capped_payment",
      agentId: "agt_research",
      policyId: "pol_research_tools",
      state: "succeeded",
      input: {
        amountMinor: 320,
        currency: "USD",
        counterpartyId: "cpty_serpstack",
        counterpartyName: "Serpstack",
        resource: "treasury:research",
        reference: "5k search credits",
        context:
          "Competitive scan for the payments brief needs roughly four thousand queries.",
      },
      policyEvaluation: evaluation(
        "approved",
        ["AUTO_APPROVED_UNDER_THRESHOLD"],
        "pol_research_tools",
        2,
        at(-34),
      ),
      createdAt: at(-34),
      updatedAt: at(-33),
    },
    {
      id: "req_scrape_credits",
      organizationId: DEMO_ORGANIZATION_ID,
      type: "capped_payment",
      agentId: "agt_research",
      policyId: "pol_research_tools",
      state: "capability_issued",
      input: {
        amountMinor: 450,
        currency: "USD",
        counterpartyId: "cpty_scrapehub",
        counterpartyName: "ScrapeHub",
        resource: "treasury:research",
        reference: "Crawl allowance top-up",
        context:
          "Crawl budget for the pricing-page sweep ran out mid-collection.",
      },
      policyEvaluation: evaluation(
        "approved",
        ["AUTO_APPROVED_UNDER_THRESHOLD"],
        "pol_research_tools",
        2,
        at(-2),
      ),
      createdAt: at(-2),
      updatedAt: at(-2),
    },
    {
      id: "req_unknown_vendor",
      organizationId: DEMO_ORGANIZATION_ID,
      type: "capped_payment",
      agentId: "agt_finance",
      policyId: "pol_vendor_payment",
      state: "denied",
      input: {
        amountMinor: 96_000,
        currency: "USD",
        counterpartyId: "cpty_unknown",
        counterpartyName: "Unlisted Supplier",
        resource: "treasury:operating",
        reference: "Emailed invoice, no purchase order",
        context:
          "Invoice arrived by email claiming updated bank details for an existing supplier.",
      },
      policyEvaluation: evaluation(
        "denied",
        ["COUNTERPARTY_NOT_ALLOWED"],
        "pol_vendor_payment",
        3,
        at(-days(1)),
      ),
      createdAt: at(-days(1) - 1),
      updatedAt: at(-days(1)),
    },
    {
      id: "req_pager_incident",
      organizationId: DEMO_ORGANIZATION_ID,
      type: "capped_payment",
      agentId: "agt_operations",
      policyId: "pol_incident_payment",
      state: "expired",
      input: {
        amountMinor: 48_000,
        currency: "USD",
        counterpartyId: "cpty_pager",
        counterpartyName: "PagerDesk",
        resource: "treasury:incident",
        reference: "Emergency escalation retainer",
        context:
          "Escalation retainer for the overnight incident bridge, requested during the outage.",
      },
      policyEvaluation: evaluation(
        "requires_approval",
        ["APPROVAL_REQUIRED"],
        "pol_incident_payment",
        1,
        at(-days(2)),
        1,
      ),
      createdAt: at(-days(2) - 1),
      updatedAt: at(-days(2)),
    },
  ].map((request) => ActionRequestSchema.parse(request));

  const approvals = [
    {
      id: "apr_figma_maya",
      actionRequestId: "req_figma_seats",
      approverId: "usr_maya",
      approverName: "Maya Chen",
      decision: "approved",
      reason: "Seat count reconciled against the directory export.",
      createdAt: at(-74),
    },
    {
      id: "apr_figma_nora",
      actionRequestId: "req_figma_seats",
      approverId: "usr_nora",
      approverName: "Nora Singh",
      decision: "approved",
      reason: "Renewal price matches the signed order form.",
      createdAt: at(-61),
    },
    {
      id: "apr_acme_maya",
      actionRequestId: "req_acme_invoice",
      approverId: "usr_maya",
      approverName: "Maya Chen",
      decision: "approved",
      reason: "Purchase order and delivery note both check out.",
      createdAt: at(-9),
    },
  ].map((approval) => ApprovalSchema.parse(approval));

  const capabilities = [
    {
      id: "cap_search_credits",
      actionRequestId: "req_search_credits",
      policyId: "pol_research_tools",
      issuedToAgentId: "agt_research",
      status: "consumed",
      scope: {
        actionKind: "capped_payment",
        resource: "treasury:research",
        amountLimitMinor: 320,
        currency: "USD",
        counterpartyId: "cpty_serpstack",
      },
      maxUses: 1,
      usesRemaining: 0,
      issuedAt: at(-34),
      expiresAt: at(-32),
    },
    {
      id: "cap_scrape_credits",
      actionRequestId: "req_scrape_credits",
      policyId: "pol_research_tools",
      issuedToAgentId: "agt_research",
      status: "active",
      scope: {
        actionKind: "capped_payment",
        resource: "treasury:research",
        amountLimitMinor: 450,
        currency: "USD",
        counterpartyId: "cpty_scrapehub",
      },
      maxUses: 1,
      usesRemaining: 1,
      issuedAt: at(-2),
      expiresAt: at(1),
    },
    {
      id: "cap_stale_incident",
      actionRequestId: "req_pager_incident",
      policyId: "pol_incident_payment",
      issuedToAgentId: "agt_operations",
      status: "expired",
      scope: {
        actionKind: "capped_payment",
        resource: "treasury:incident",
        amountLimitMinor: 48_000,
        currency: "USD",
        counterpartyId: "cpty_pager",
      },
      maxUses: 1,
      usesRemaining: 1,
      issuedAt: at(-days(2)),
      expiresAt: at(-days(2) + 2),
    },
  ].map((capability) => CapabilityGrantSchema.parse(capability));

  const receipts = [
    {
      id: "rcp_search_credits",
      capabilityId: "cap_search_credits",
      actionRequestId: "req_search_credits",
      agentId: "agt_research",
      connectorId: SANDBOX_CONNECTOR_ID,
      idempotencyKey: "seed-search-credits-0001",
      status: "succeeded",
      amountMinor: 320,
      currency: "USD",
      counterpartyId: "cpty_serpstack",
      providerReference: "sbx_seed0000search01",
      executedAt: at(-33),
    },
  ].map((receipt) => ExecutionReceiptSchema.parse(receipt));

  const auditEvents = [
    {
      id: "evt_seed_request",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_acme_invoice",
      actor: { type: "agent", id: "agt_finance", displayName: "Finance Agent" },
      eventType: "action.requested",
      outcome: "info",
      summary: "Finance Agent requested $4,200.00 to Acme Components",
      metadata: { amountMinor: 420_000, currency: "USD" },
      occurredAt: at(-13),
    },
    {
      id: "evt_seed_evaluated",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_acme_invoice",
      actor: { type: "system", id: "policy-engine", displayName: "Policy engine" },
      eventType: "policy.evaluated",
      outcome: "allowed",
      summary: "Policy Approved vendor payment v3 returned requires_approval",
      metadata: { status: "requires_approval", requiredApprovals: 2 },
      occurredAt: at(-12),
    },
    {
      id: "evt_seed_approval",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_acme_invoice",
      actor: { type: "human", id: "usr_maya", displayName: "Maya Chen" },
      eventType: "approval.recorded",
      outcome: "allowed",
      summary: "Maya Chen approved req_acme_invoice",
      metadata: { decision: "approved" },
      occurredAt: at(-9),
    },
    {
      id: "evt_seed_denied",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_unknown_vendor",
      actor: { type: "system", id: "policy-engine", displayName: "Policy engine" },
      eventType: "policy.evaluated",
      outcome: "denied",
      summary: "Policy Approved vendor payment v3 returned denied",
      metadata: { status: "denied", reasonCodes: "COUNTERPARTY_NOT_ALLOWED" },
      occurredAt: at(-days(1)),
    },
    {
      id: "evt_seed_issued",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_scrape_credits",
      actor: { type: "system", id: "authority-service", displayName: "Authority service" },
      eventType: "capability.issued",
      outcome: "allowed",
      summary: "req_scrape_credits moved from approved to capability_issued",
      metadata: { toState: "capability_issued" },
      occurredAt: at(-2),
    },
    {
      id: "evt_seed_executed",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_search_credits",
      actor: { type: "agent", id: "agt_research", displayName: "Research Agent" },
      eventType: "action.executed",
      outcome: "allowed",
      summary: "req_search_credits moved from executing to succeeded",
      metadata: { toState: "succeeded", amountMinor: 320 },
      occurredAt: at(-33),
    },
    {
      id: "evt_seed_handoff",
      organizationId: DEMO_ORGANIZATION_ID,
      actionRequestId: "req_acme_invoice",
      actor: { type: "agent", id: "agt_vendor", displayName: "Vendor Agent" },
      eventType: "handoff.authorized",
      outcome: "allowed",
      summary: "Vendor Agent passed verified supplier evidence to Finance Agent",
      metadata: { dataClassification: "confidential" },
      occurredAt: at(-14),
    },
  ].map((event) => AuditEventSchema.parse(event));

  const handoffs = [
    {
      id: "hnd_vendor_finance",
      fromAgentId: "agt_vendor",
      toAgentId: "agt_finance",
      actionRequestId: "req_acme_invoice",
      state: "authorized",
      dataClassification: "confidential",
      purpose: "Share verified supplier banking evidence for invoice INV-2291.",
      createdAt: at(-14),
      expiresAt: at(days(1)),
    },
    {
      id: "hnd_ops_deployment",
      fromAgentId: "agt_operations",
      toAgentId: "agt_deployment",
      state: "rejected",
      dataClassification: "restricted",
      purpose: "Requested production release credentials for a staging rollout.",
      createdAt: at(-days(1)),
      expiresAt: at(-days(1) + 60),
    },
  ].map((handoff) => AgentHandoffSchema.parse(handoff));

  const connectors = [
    {
      id: SANDBOX_CONNECTOR_ID,
      name: "Sandbox payments",
      kind: "sandbox_payment",
      status: "active",
      description:
        "Deterministic simulator. Records receipts and settles nothing — no money moves.",
    },
  ].map((connector) => ConnectorSchema.parse(connector));

  const keyedAgents = [
    { id: "agt_finance", name: "Finance Agent" },
    { id: "agt_research", name: "Research Agent" },
    { id: "agt_operations", name: "Operations Agent" },
  ];
  const bootstrapApiKeys: BootstrapApiKey[] = [];
  const apiKeys = keyedAgents.map((agent, index) => {
    const generated = generateApiKey();
    bootstrapApiKeys.push({
      agentId: agent.id,
      agentName: agent.name,
      secret: generated.secret,
    });

    return ApiKeySchema.parse({
      id: `key_seed${index}`,
      agentId: agent.id,
      name: `${agent.name} default key`,
      prefix: generated.prefix,
      secretHash: generated.secretHash,
      createdAt: at(-days(7)),
    });
  });

  // Demo data. Mirrors the research-tools policy, which auto-approves below
  // $5 and escalates above it — the split the branching node exists to show.
  const blueprints = [
    AgentBlueprintSchema.parse({
      id: "bp_research_tools",
      organizationId: DEMO_ORGANIZATION_ID,
      name: "Research tool top-ups",
      summary:
        "Keeps the research agent's paid data sources topped up without handing it a card, escalating anything above the auto-approval line.",
      agentId: "agt_research",
      status: "published",
      trigger: {
        kind: "schedule",
        label: "Every weekday at 08:00",
      },
      steps: [
        {
          kind: "step",
          id: "nd_check_credits",
          label: "Check remaining API credits",
          detail:
            "Reads usage from the connected data providers and decides whether a top-up is needed.",
        },
        {
          kind: "policy_gate",
          id: "nd_gate",
          policyId: "pol_research_tools",
        },
      ],
      branching: {
        id: "nd_split",
        label: "Policy decision",
        branches: [
          {
            id: "br_auto",
            outcome: "auto_approved",
            label: "Under $5",
            steps: [
              {
                kind: "action",
                id: "nd_pay_small",
                actionKind: "capped_payment",
                label: "Top up the provider",
              },
              {
                kind: "notify",
                id: "nd_notify_manager",
                audience: "manager",
                label: "Post the receipt to the manager",
              },
            ],
          },
          {
            id: "br_review",
            outcome: "requires_approval",
            label: "$5 and above",
            steps: [
              {
                kind: "notify",
                id: "nd_notify_approvers",
                audience: "approvers",
                label: "Send to the approvals inbox",
              },
              {
                kind: "action",
                id: "nd_pay_large",
                actionKind: "capped_payment",
                label: "Top up once approved",
              },
            ],
          },
        ],
      },
      createdAt: at(-days(9)),
      updatedAt: at(-days(2)),
    }),
  ];

  return {
    seed: {
      agents,
      policies,
      blueprints,
      actionRequests,
      approvals,
      capabilities,
      receipts,
      auditEvents,
      handoffs,
      connectors,
      apiKeys,
      proofAnchors: [],
    },
    bootstrapApiKeys,
  };
}
