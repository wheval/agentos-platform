# ADR 0001: Start with a modular Next.js control plane

- **Status:** Accepted
- **Date:** 2026-07-31

## Context

AgentOS must become a private control plane for high-stakes autonomous actions. Its first wedge
is capped payments and credentials, but the same model must later govern engineering, HR,
cloud, SaaS, and agent-to-agent delegation.

Phase 0/1 needs credible product and domain foundations without implying that credential
custody, execution security, persistence, or Midnight proofs already exist.

## Decision

Build one strict TypeScript repository using Next.js App Router rather than distributing early
domain logic across microservices.

1. Keep validated domain schemas in `src/domain`.
2. Keep deterministic, framework-independent workflow services in `src/application`.
3. Keep the initial operator dashboard server-rendered and backed by validated static demo data.
4. Represent custody and policy-proof systems only through narrow ports.
5. Separate policy approval from capability custody as an architectural invariant.
6. Treat audit events as structured application records; do not call them immutable proofs.
7. Use Node 22, pinned pnpm, Vitest, ESLint, TypeScript, and production builds as CI gates.

## Trust boundaries

### Control plane

Owns agent identity metadata, policy versions, action-request state, approvals, and audit
coordination. A local policy result is not sufficient evidence of secure credential use.

### Vault adapter

Will own encrypted secret custody and capability issuance/use in an isolated security domain.
The control plane sends a bounded command and receives a capability reference, never a
long-lived raw credential.

### Connector

Will consume a single approved capability for one idempotent external action. It must reject
scope changes and expired, revoked, consumed, or replayed grants.

### Midnight proof adapter

Will eventually commit policies and actions and prove compliance with private witnesses.
Credentials, private memory, detailed action context, and customer data remain encrypted
off-chain. This phase contains no blockchain integration.

## Alternatives considered

- **Premature microservices:** rejected because deployment and consistency overhead would
  outpace the first vertical slice. Pure application services and ports preserve extraction
  seams.
- **Embedding custody in the web application:** rejected because it collapses policy approval
  and secret custody into one compromise domain.
- **Mock blockchain transactions:** rejected because they would misrepresent roadmap behavior
  as implemented security.
- **Mutable UI-only workflow state:** rejected because workflow invariants belong in a tested
  domain service, not presentation code.

## Consequences

The repository can ship and test the policy semantics quickly while retaining clear boundaries
for a real vault, durable persistence, authenticated tenants, connectors, and proofs. The
current dashboard remains a simulation until those adapters and security controls are
implemented and reviewed.
