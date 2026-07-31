# 0003 — Product surface: agent API, MCP, and operator authentication

- Status: accepted
- Date: 2026-02

## Context

PayBox and Stripe converged on the same lifecycle AgentOS models: an agent
submits an intent carrying human-readable context, policy evaluates it, a human
approves when required, and only then does a scoped, short-lived credential
appear. Studying both surfaced two product decisions worth copying and one worth
rejecting.

Worth copying: **the connect surface for a model is one URL**. PayBox's entire
developer story is an MCP endpoint plus OAuth. Worth copying: **the approval
carries context**, because a human approving "$1,842 to Acme Cloud for the
January invoice" makes a better decision than one approving "$1,842".

Worth rejecting: both products are consumer wallets for one person's assistant.
AgentOS is an organisational control plane over a fleet of agents, so identity
belongs to the agent, not the human.

## Decision

### Three surfaces, one orchestrator

`AuthorityService` is the only component that mutates authority state and the
only writer to the audit ledger. The REST API, the MCP server and the console's
server actions are all thin adapters over it. A decision made through MCP is
byte-identical to one made through the console because there is only one code
path that can make it.

### Agent authentication is per-agent API keys

Keys are `aos_sk_<8-hex-prefix>_<43-char-secret>`. Only a SHA-256 digest is
stored; comparison is constant-time via `timingSafeEqual`. The prefix exists so
a key can be looked up in one indexed read without scanning every digest.

Keys identify an *agent*, not a user. This is the point: authority is scoped to
the agent's job description, and revoking a key removes one agent's ability to
act without touching anything else.

### Operator authentication is a shared secret, and says so

Sign-in takes a shared token and returns an HMAC-signed HttpOnly session cookie,
built with `node:crypto` only. When `OPERATOR_ACCESS_TOKEN` is unset the app
runs in demo mode behind a visible banner rather than silently unauthenticated.

This is deliberately the smallest thing that is honestly describable. SSO,
per-user identity and multi-tenancy are roadmap, and the console says so rather
than implying a maturity that does not exist. Every server action re-checks the
session, because a server action is a public HTTP endpoint regardless of which
component renders its form.

### Execution goes through a connector port

`PaymentConnector` has one adapter, `SandboxPaymentConnector`, which is
deterministic and moves no money. Receipts are durable and idempotency keys are
required, so a retrying agent cannot double-charge. Every surface that displays
a receipt labels it as sandbox.

## Consequences

Adding a surface means adding an adapter, not re-implementing policy. Adding a
connector means implementing one port.

The audit ledger is complete by construction: since `AuthorityService` is the
only mutator, there is no path that changes authority state without writing an
event.

Operator auth is not enterprise-ready and is not claimed to be.

## Alternatives considered

**OAuth for agents.** Correct eventually, wrong now: it needs a user identity
model that does not exist yet, and API keys are the interoperable baseline.

**MCP as the only surface.** Rejected — REST is what a non-model backend
integration uses, and MCP is a thin projection of it.

**Sessions in the store.** Rejected: a signed stateless cookie needs no
persistence and no revocation infrastructure for a single shared operator
credential. It becomes wrong the moment there are real user accounts, and that
is the moment to change it.
