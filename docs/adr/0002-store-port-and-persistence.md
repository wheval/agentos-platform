# 0002 — Storage behind a port, in-memory first

- Status: accepted
- Date: 2026-02
- Supersedes: nothing

## Context

Phase 0/1 held domain objects in module-level constants. That was fine for a
static dashboard and useless the moment the console needed to approve a request,
issue a grant and redeem it.

The obvious next step is a database. Reaching for one immediately would have
been the wrong order of work: the domain was still moving weekly, and a schema
migration per domain change would have slowed exactly the part of the system
that most needed to move fast. It would also have coupled the first real
end-to-end lifecycle to infrastructure choices we could not yet justify.

## Decision

All persistence goes through a single `AgentOsStore` port. The application layer
never imports a database client, and the only adapter today is
`InMemoryStore`.

Three properties of the port matter more than the adapter behind it:

**Reads are explicit queries, not table scans.** `listCapabilitiesForPolicy`,
`listReceiptsForCapability` and friends exist because a SQL adapter must be able
to answer them with an index rather than by loading everything.

**Writes that must be atomic are expressed as one call.** Approving a request
appends the approval, updates the request and appends audit events together. A
SQL adapter maps this to a transaction; the in-memory adapter maps it to a
synchronous block.

**Concurrency is a first-class part of the contract.** `runExclusive` serialises
the read-spend-window-then-issue-grant sequence. Without it, two concurrent
requests can both read a window with room and both issue a grant, overspending
the ceiling. This is not hypothetical — it is the canonical double-spend in any
budget system. The in-memory adapter implements it with a promise chain; a SQL
adapter implements it with `SELECT ... FOR UPDATE` or a serializable
transaction. Either way the application code is unchanged.

## Consequences

State is lost on restart, and the process is single-instance. Both are stated in
the console's environment card rather than hidden, and both are acceptable for a
foundation whose purpose is to prove the lifecycle.

Seed data is generated through the same store API that the console mutates, so
there is no privileged write path that bypasses validation.

The migration to Postgres is an adapter plus a schema, not a refactor. The test
suite runs entirely against the port, so a second adapter can be validated
against the same behavioural tests.

## Alternatives considered

**Postgres immediately.** Rejected for sequencing, not on merit. It is the
expected next adapter.

**A generic repository per entity.** Rejected: it pushes transaction boundaries
into the application layer, where they become easy to get wrong, and it makes
the atomicity requirements invisible.
