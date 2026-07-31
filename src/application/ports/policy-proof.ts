import type { PolicyEvaluation } from "@/domain/schemas";

export type PolicyProofReceipt = {
  policyCommitment: string;
  actionCommitment: string;
  proofReference: string;
  verifiedAt: string;
};

/**
 * Trust boundary: the proof layer receives commitments and private witness
 * material through its own adapter. This application must not treat a local
 * policy result as a blockchain proof.
 */
export interface PolicyProofPort {
  proveAndVerify(evaluation: PolicyEvaluation): Promise<PolicyProofReceipt>;
}
