# AgentOS

**The private control plane for trustworthy autonomous AI.**

An agent asks to spend $1,842 with Acme Cloud. AgentOS decides whether its job
description permits it, whether the policy allows the amount, currency,
counterparty and resource, whether the rolling spend window has room, and
whether a human must sign off. Only after that does the agent receive authority
— scoped to that amount, that counterparty, that resource, expiring in minutes,
usable once. Every step is written to an audit ledger, and every decision is
anchored as a zero-knowledge commitment so it can be proven later without
revealing what was bought or from whom.

Agents never hold long-lived credentials. Policy approval and secret custody are
separate trust domains by design.

Payments are the wedge because they are the highest-stakes, most legible test of
the primitive. The primitive itself is *scoped, revocable, auditable authority*,
and it generalises to engineering, cloud, HR, SaaS and governed agent-to-agent
delegation.

---

## Status

This is a working foundation, not a production system. The table below is the
honest split, and the rest of this README does not blur it.

| Area | State |
| --- | --- |
| Domain model, validation, state machine | Implemented |
| Policy engine, spend windows, approvals | Implemented |
| Capability issuance, expiry, revocation, redemption | Implemented |
| Audit ledger | Implemented |
| Operator console with real mutations | Implemented |
| Agent REST API + MCP server | Implemented |
| ZK commitment scheme + Compact contract | Implemented |
| Midnight node submission | Config-gated; declines when unconfigured |
| Agent-to-agent handoffs | Modelled and stored; no service path or UI yet |
| Real credential custody | **Not built** — documented port only |
| Real payment rails | **Not built** — sandbox connector only |
| Persistence beyond process memory | **Not built** — in-memory adapter only |
| SSO, multi-tenancy, per-user identity | **Not built** |

No real money can move. No production security claim is made.

---

## Run it

Requires Node 22 and pnpm.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

The app boots with seeded demo data — five agents, four policies, live requests
and grants — labelled as demo data everywhere it appears. With no environment
configured it runs in demo mode behind a visible banner.

```bash
pnpm test         # 129 tests
pnpm lint
pnpm typecheck
pnpm build
```

### Configuration

Every variable is optional. Each one that is unset degrades to a visibly weaker
mode rather than a silently broken one.

| Variable | Effect when unset |
| --- | --- |
| `AGENTOS_OPERATOR_TOKEN` | Console runs in demo mode, banner shown |
| `AGENTOS_ORGANIZATION_SECRET` | A random per-boot secret is used; commitments do not survive a restart |
| `AGENTOS_MIDNIGHT_NETWORK` | Anchors are recorded locally, marked `local` |
| `AGENTOS_MIDNIGHT_INDEXER_URL` | ditto |
| `AGENTOS_MIDNIGHT_NODE_URL` | ditto |
| `AGENTOS_MIDNIGHT_PROOF_SERVER_URL` | ditto |
| `AGENTOS_MIDNIGHT_CONTRACT_ADDRESS` | ditto |

---

## How authority flows

```
agent submits intent + context
        ↓
policy evaluation      ← job description, amount, currency, counterparty,
        ↓                resource, validity window, rolling spend window
   ┌────┴────┐
denied    requires approval ──→ human approvers (threshold, dual control)
                    ↓
              capability issued   ← scoped to amount/counterparty/resource,
                    ↓               expires in 300s, single use
              execution + receipt ← idempotent, sandbox connector
                    ↓
              audit event + ZK anchor
```

Illegal transitions are rejected by the state machine rather than by convention:
a request cannot skip evaluation, be approved after denial, be re-executed once
settled, or be cancelled after a capability exists.

Spend accounting is **committed, not settled**. A live unredeemed grant counts
against the window at its ceiling; revoking or expiring it returns the budget.
Without this, two concurrent requests can both see room and both be granted.

---

## Surfaces

**Operator console** (`/console`) — overview, agents, policies, requests and
request detail, capabilities, audit ledger, proofs, settings. Every mutation is
a server action that re-checks the session, because a server action is a public
endpoint.

**Agent REST API** (`/api/v1`) — `POST /action-requests`, `GET
/action-requests/:id`, `POST /action-requests/:id/capability`, `GET
/capabilities`, `POST /capabilities/:id/execute`. Authenticated with per-agent
keys (`aos_sk_…`) stored only as SHA-256 digests and compared in constant time.

**MCP server** (`/api/mcp`) — the same lifecycle as tools a model can call
directly: `list_capabilities`, `request_payment`, `check_action_request`,
`claim_capability`, `execute_capability`.

All three are thin adapters over one `AuthorityService`. There is exactly one
code path that can change authority state, and it is the only writer to the
audit ledger — which is what makes the ledger complete by construction.

---

## Midnight

Midnight is a core subsystem, not a roadmap item. See
[ADR 0004](docs/adr/0004-midnight-proof-anchoring.md) and
[`contracts/README.md`](contracts/README.md).

`contracts/policy-anchor.compact` is a real Compact contract. Each policy is
registered as a commitment binding every constraint that gates a decision; each
approval and execution emits a nullifier binding `(organisation, request,
outcome)` under a separate domain separator. Neither reveals amounts, vendors,
agents or approvers.

The rule that makes this trustworthy: **no adapter reports chain state it did
not receive from a node.** `LocalCommitmentAnchor` is the default and states
plainly that nothing is published. `MidnightProofAnchor` returns
`accepted: false` with a reason — and no transaction hash — when it is
unconfigured, has no submitter, or fails to submit. There is no code path that
fabricates one.

A failed anchor never fails a decision; it writes a `proof.failed` event.

Outstanding: the TypeScript commitments use SHA-256 while the circuit uses
Compact's `persistentHash`. They share structure and domain separators but are
not byte-identical, which is required before third-party verification means
anything.

---

## Deliberately not built

**Credential custody.** `src/application/ports/vault.ts` documents the boundary
and the six guarantees a real implementation must provide. Nothing implements
it. The realistic path is a managed issuer behind that port, not a vault we
write ourselves. No bespoke cryptography.

**Payment rails.** `SandboxPaymentConnector` is deterministic and moves nothing.

**Durable storage.** `InMemoryStore` is the only adapter. The port is shaped so
a SQL adapter is a drop-in: queries are indexable, atomic writes are single
calls, and `runExclusive` maps to a serializable transaction.

---

## Architecture

```
src/domain/          Zod schemas — the single source of truth
src/application/     Policy evaluation, state machine, authority service, ports
src/infrastructure/  In-memory store, sandbox connector, proof anchors, seed
src/app/             Marketing site, operator console, REST API, MCP
contracts/           Compact contract for on-chain anchoring
```

Dependencies point inward. The application layer imports no database client, no
HTTP framework and no React.

Decisions are recorded in [`docs/adr/`](docs/adr):

- [0001](docs/adr/0001-control-plane-foundation.md) — control plane foundation
- [0002](docs/adr/0002-store-port-and-persistence.md) — storage behind a port
- [0003](docs/adr/0003-product-surface-and-authentication.md) — surfaces and auth
- [0004](docs/adr/0004-midnight-proof-anchoring.md) — Midnight anchoring

---

## Next

1. Byte-identical commitments between the circuit and TypeScript, then a
   deployed contract and a live `MidnightSubmitter`.
2. A Postgres adapter behind `AgentOsStore`.
3. A managed issuer behind `VaultPort` — the first point at which real money
   could move, and the point at which a security review becomes mandatory.
4. Agent-to-agent handoffs: delegated authority that narrows, never widens.
