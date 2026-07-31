# 0004 — Midnight proof anchoring, and the rule against fabricated chain state

- Status: accepted
- Date: 2026-02

## Context

An organisation running agents against real money eventually has to answer a
question it cannot answer with its own database: *prove every action your agents
took was authorised by an approved policy.*

Publishing the decisions answers it and leaks the business — vendors, amounts,
cadence, internal approval structure. Pointing at an internal audit log does not
answer it at all, because the operator can rewrite the log. Both failure modes
are structural, not fixable by better logging.

Zero-knowledge proofs are the actual answer, and Midnight is the platform whose
whole design point is exactly this shape: public verifiability with private
data.

## Decision

**Midnight is a core subsystem of AgentOS, not a roadmap item.** The proof layer
is built now, in three parts.

### 1. The contract is real

`contracts/policy-anchor.compact` registers policy commitments and records
decision nullifiers. It is a genuine Compact contract with correct disclosure
annotations, distinct domain separators for commitments and nullifiers, and a
membership check that rejects a decision for an unregistered policy. It is not a
mock.

### 2. Commitments are computed by the application, not the adapter

`buildPolicyCommitment` and `buildDecisionNullifier` live in the application
layer and produce identical output whichever anchor is configured. This is what
makes the local and Midnight paths equivalent in meaning: switching adapters
changes *where commitments are published*, never *what they commit to*.

The commitment binds every constraint that gates a decision — amount ceiling,
currency, resources, counterparties, approval threshold, spend window — under a
length-prefixed preimage so that no two distinct policies can collide by
shuffling field boundaries. Counterparties and resources are sorted, so
semantically identical policies commit identically.

The nullifier binds `(organisation, request, outcome)` under a separate
separator, so a decision is identifiable without revealing its policy or agent,
and cannot be replayed across organisations.

### 3. The adapter refuses to lie

This is the rule that makes the whole thing trustworthy:

> **No adapter may report chain state it did not receive from a node.**

Concretely:

- `LocalCommitmentAnchor` is the default. It records real, recomputable
  commitments in operator storage, reports `network: "local"`, and its own
  description states that nothing is published and the operator could rewrite
  the record.
- `MidnightProofAnchor` is config-gated. Unconfigured, missing a submitter, or
  on submission failure, it returns `accepted: false` with a machine-readable
  reason and **no transaction hash**. There is no code path that invents one.
- The commitments the local anchor computes are structurally the same as the
  contract's but not byte-identical (SHA-256 versus Compact's `persistentHash`).
  `contracts/README.md` states this outright instead of implying parity.

### Anchoring never gates a decision

A failed anchor writes a `proof.failed` audit event and the authority decision
stands. Proof is an accountability guarantee, not an availability dependency —
a chain outage must not stop an approved payment, and must not silently vanish
either.

## Consequences

Every approval and execution produces a commitment and a nullifier today, with a
visible network and state in the console's proofs view. Turning on Midnight is
configuration plus a submitter implementation, not a redesign.

The honest failure surface is more visible than a mock would be: an operator can
see at a glance that anchors are `local`, which is the intended effect.

Byte-identical hashing between TypeScript and the circuit remains outstanding
and is required before third-party verification is meaningful.

## Alternatives considered

**A mocked Midnight client returning plausible hashes.** Rejected outright. A
fabricated transaction hash is worse than no integration: it defeats the exact
property the feature exists to provide, and it would be indistinguishable from
the real thing in a demo.

**Anchoring the full decision.** Rejected — it publishes the business.

**Waiting for a deployed contract before writing any of it.** Rejected. The
commitment scheme is the hard, security-relevant part and belongs under test
now; node submission is comparatively mechanical.
