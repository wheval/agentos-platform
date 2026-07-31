# AgentOS

**The private control plane for trustworthy autonomous AI.**

AgentOS governs consequential agent actions before authority is granted. Each agent has an
identity, job description, accountable manager, and scoped permissions. The initial product
wedge is payment and credential authority: an agent requests one bounded action, policy is
evaluated, required humans approve, and an isolated vault can eventually issue or use a
short-lived capability.

This repository is the independent public AgentOS product foundation. It is not a Midnight
challenge repository and contains no copied challenge implementation.

## Current status: Phase 0/1 foundation

The application currently provides:

- a polished, responsive operator dashboard backed by clearly labeled static demo data;
- strict Zod models for `Agent`, `Policy`, `ActionRequest`, `Approval`,
  `CapabilityGrant`, `AuditEvent`, and `AgentHandoff`;
- deterministic capped-payment policy evaluation for agent status, permission, policy
  validity, amount, currency, counterparty, resource, and approval requirements;
- an explicit action-request state machine with validated audit events;
- approval threshold evaluation with authorized, distinct approvers;
- capability-use checks for agent, request, action, resource, amount, currency, counterparty,
  status, and expiry;
- interfaces that separate policy approval from future credential custody and proof systems;
- unit tests and Node 22 CI for lint, typecheck, test, and production build.

### Not implemented

AgentOS does **not** yet store credentials, issue production capabilities, move money, persist
records, authenticate organizations, or produce blockchain/Midnight proofs. Dashboard execution
and audit records are simulations, not production security controls or immutable evidence.

## Architecture

AgentOS starts as a focused TypeScript single repository:

```text
src/
├── app/                    Next.js App Router operator surface
├── application/            Policy, approval, capability, audit, and lifecycle services
│   └── ports/              Vault and policy-proof trust-boundary interfaces
├── components/             Presentational UI
├── domain/                 Strict schemas and inferred domain types
└── lib/                    Validated, static demo dataset
tests/                      Vitest unit tests
docs/adr/                   Architecture decisions
```

The dashboard is a React Server Component. Domain services are framework-independent pure
functions so they can move behind authenticated application boundaries without rewriting the
policy semantics.

The architecture decision is recorded in
[`docs/adr/0001-control-plane-foundation.md`](docs/adr/0001-control-plane-foundation.md).

## Capped-payment lifecycle

```text
requested
  → evaluating
  → denied
  └→ pending_approval → approved → capability_issued → executing → succeeded | failed
```

Every accepted transition returns a structured `AuditEvent`. Invalid and terminal-state
transitions fail closed.

## Local development

Requirements: Node.js 22 and the package manager pinned in `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Security boundary

Policy approval and secret custody must remain separate:

- the control plane may request a resource-, amount-, counterparty-, and time-bounded grant;
- a future vault adapter must run in an isolated custody domain and never return long-lived raw
  credentials to an agent or this application;
- capability use must be idempotent, revocable, narrowly scoped, and recorded;
- private memory, credentials, and detailed action context remain encrypted off-chain;
- a future Midnight adapter may prove policy compliance from commitments and private witnesses,
  but must never place raw secrets or private memory on-chain.

Do not build bespoke custody cryptography in this repository.

## Next vertical slice

Implement an authenticated organization boundary and a real `VaultPort` adapter backed by an
established secret-management system, then execute one sandbox payment connector action with
idempotency, revocation, durable audit storage, and human approval receipts. A Midnight
`PolicyProofPort` adapter should follow that vault slice and prove policy compliance without
changing the off-chain custody boundary.
