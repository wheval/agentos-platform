import type {
  AnchorSubmission,
  DecisionAnchorRequest,
  PolicyProofAnchor,
  PolicyRegistration,
} from "@/application/ports/policy-proof";
import type { ProofNetwork } from "@/domain/schemas";

/**
 * Records anchors locally, with no chain involved.
 *
 * This is the default adapter and it is honest about what it is: the
 * commitments and nullifiers it stores are real, tamper-evident and
 * independently recomputable by an auditor holding the preimages, but they are
 * published nowhere. Nobody outside the operator can verify them, and the
 * operator could in principle rewrite the record.
 *
 * That last sentence is the entire reason the Midnight adapter exists. Moving
 * to it changes where these commitments are published, not what they mean —
 * the preimages are built by the same code either way.
 */
export class LocalCommitmentAnchor implements PolicyProofAnchor {
  readonly network: ProofNetwork = "local";
  readonly status = "ready" as const;
  readonly description =
    "Commitments recorded in operator storage. Real and recomputable, but not published to any chain, so third parties cannot verify them.";

  #registeredPolicies = new Set<string>();

  async registerPolicy(
    registration: PolicyRegistration,
  ): Promise<AnchorSubmission> {
    this.#registeredPolicies.add(registration.policyCommitment);

    return { accepted: true, network: this.network, state: "recorded" };
  }

  async anchorDecision(
    request: DecisionAnchorRequest,
  ): Promise<AnchorSubmission> {
    if (!this.#registeredPolicies.has(request.policyCommitment)) {
      // Mirrors the contract's membership check, so a decision that would be
      // rejected on-chain is rejected here too rather than silently recorded.
      return {
        accepted: false,
        network: this.network,
        reason: "policy_not_registered",
      };
    }

    return { accepted: true, network: this.network, state: "recorded" };
  }
}
