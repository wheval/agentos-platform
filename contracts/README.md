# `policy-anchor.compact`

The on-chain half of AgentOS's proof layer.

## What this contract is for

AgentOS makes authority decisions about real money. An organisation that wants
to prove to an auditor, a regulator, or a counterparty that *every* agent action
went through an approved policy has two bad options today: publish the decisions
(which leaks vendors, amounts and internal structure), or ask everyone to trust
its own database (which the operator can rewrite).

Midnight is the third option. This contract anchors a commitment to each policy
and a nullifier for each decision. Neither reveals the underlying data, but both
are independently recomputable by anyone who already holds the preimages —
meaning an auditor granted access to the private record can verify it against a
public chain the operator does not control.

## What is proven on-chain

| On-chain | Off-chain, encrypted, never published |
| --- | --- |
| A policy commitment exists | The policy's limits, counterparties, approvers |
| A decision nullifier for a given policy exists | The amount, vendor, agent, human approver |
| The decision's outcome class (`approved` / `executed`) | The action's business context |
| That the same decision was not anchored twice | The credential used to execute it |

The commitment binds the constraints that actually gate a decision: amount
ceiling, currency, allowed resources, allowed counterparties, approval threshold
and spend window. Change any of them and the commitment changes, so a policy
cannot be quietly loosened after the fact and still match an earlier anchor.

The nullifier binds `(organisation, action request, outcome)` under a distinct
domain separator, so it identifies a decision without revealing which policy or
agent produced it, and cannot be replayed.

## Domain separators

Three separators are used, and they must never collide:

- `agentos:policy:v1` — policy commitments
- `agentos:decision:v1` — decision nullifiers
- `agentos:org:v1` — organisation binding

`src/application/proof-commitments.ts` uses the same separators and the same
length-prefixed preimage layout, so the TypeScript side and the circuit agree on
what is being committed to.

## The honesty rule

The TypeScript commitments are **not byte-identical** to the circuit's. The
contract uses Compact's ZK-friendly `persistentHash`; the local anchor uses
SHA-256. They share structure and separators, not output. This is stated plainly
rather than papered over: `LocalCommitmentAnchor` records real, recomputable
commitments in operator storage and says so, and `MidnightProofAnchor` refuses
to return a transaction hash it did not receive from a node. Neither ever
fabricates chain state.

Making them byte-identical requires running the compiled circuit's hash through
the Midnight JS bindings, which is part of wiring a real deployment.

## Compiling

The Compact toolchain is not a dependency of this repository, and CI does not
compile the contract. To build it locally:

```bash
compact compile contracts/policy-anchor.compact contracts/managed/policy-anchor
```

Output lands in `contracts/managed/policy-anchor/` as prover keys, verifier keys
and ZK IR, plus generated TypeScript bindings.

### Circuit size

ProofStation on preview requires `k >= 6`. A circuit this small can fail to
prove with `prove: no SRS params for k=6`. The contract carries padding ledger
fields for exactly this reason; do not remove them without re-checking that the
circuit still proves on the target network.

## Wiring a real deployment

`MidnightProofAnchor` is already written against a `MidnightSubmitter` port and
is config-gated. To make it live:

1. Compile the contract and deploy it, recording the contract address.
2. Set `AGENTOS_MIDNIGHT_NETWORK`, `AGENTOS_MIDNIGHT_INDEXER_URL`,
   `AGENTOS_MIDNIGHT_NODE_URL`, `AGENTOS_MIDNIGHT_PROOF_SERVER_URL` and
   `AGENTOS_MIDNIGHT_CONTRACT_ADDRESS`.
3. Implement `MidnightSubmitter` over the Midnight JS SDK, calling the
   `registerPolicy` and `anchorDecision` circuits.
4. Replace the TypeScript commitment functions with the circuit's own hash so
   the two sides are byte-identical.

Until step 3 exists, `readMidnightConfig` reports what is missing and the anchor
declines rather than pretending.
