import type { ProofNetwork } from "@/domain/schemas";

/**
 * The boundary between AgentOS and the policy-anchor contract on Midnight.
 *
 * AgentOS is deliberately split in two. Encrypted secrets, private agent memory
 * and the policy bodies themselves stay in operator-controlled storage. What
 * goes on-chain is the *proof that a rule was followed* — commitments and
 * nullifiers, never the underlying facts. This port is where that split is
 * enforced: an adapter receives commitments that have already been computed and
 * has no way to reach credential material.
 *
 * `contracts/policy-anchor.compact` is the on-chain half. Its three domain
 * separators are mirrored by the preimage builders below so a decision anchored
 * locally and the same decision anchored on Midnight describe the same fact.
 */

export type PolicyRegistration = {
  policyId: string;
  /** SHA-256 of the canonical policy preimage. Never the policy body. */
  policyCommitment: string;
};

export type DecisionAnchorRequest = {
  organizationId: string;
  actionRequestId: string;
  policyId: string;
  policyCommitment: string;
  decisionNullifier: string;
  outcome: "approved" | "executed";
};

export type AnchorSubmission =
  | {
      accepted: true;
      network: ProofNetwork;
      state: "recorded" | "submitted" | "confirmed";
      transactionHash?: string;
    }
  | {
      accepted: false;
      network: ProofNetwork;
      /**
       * Why nothing was anchored. An adapter that cannot reach a chain reports
       * this rather than inventing a transaction hash.
       */
      reason: string;
    };

export interface PolicyProofAnchor {
  readonly network: ProofNetwork;
  /**
   * `ready` when the adapter can anchor, `unconfigured` when it is present but
   * has no network credentials. An unconfigured adapter must refuse to anchor.
   */
  readonly status: "ready" | "unconfigured";
  readonly description: string;

  registerPolicy(registration: PolicyRegistration): Promise<AnchorSubmission>;
  anchorDecision(request: DecisionAnchorRequest): Promise<AnchorSubmission>;
}
