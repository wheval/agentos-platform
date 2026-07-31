import type { CapabilityGrant, ExecutionReceipt } from "@/domain/schemas";

export type SpendWindowInput = {
  grants: CapabilityGrant[];
  receipts: ExecutionReceipt[];
  policyId: string;
  windowStart: string;
};

/**
 * Sums the authority already committed under a policy inside a rolling window.
 *
 * "Committed" rather than "settled" is the important choice. A grant that has
 * been issued but not yet redeemed is authority the agent currently holds, so
 * it must count against the budget — otherwise an agent could accumulate ten
 * live grants of the full window ceiling and spend them all at once.
 *
 * Each grant contributes exactly once:
 *  - revoked or expired grants contribute nothing, because the authority was
 *    withdrawn before it could be used;
 *  - a grant with settled executions contributes what actually settled;
 *  - any other live grant contributes its ceiling, the most it could still cost.
 *
 * Failed executions contribute nothing, because no value moved.
 */
export function computeCommittedSpendMinor(input: SpendWindowInput): number {
  const windowStart = new Date(input.windowStart).getTime();
  const settledByCapability = new Map<string, number>();

  for (const receipt of input.receipts) {
    if (receipt.status !== "succeeded") continue;

    settledByCapability.set(
      receipt.capabilityId,
      (settledByCapability.get(receipt.capabilityId) ?? 0) + receipt.amountMinor,
    );
  }

  let total = 0;

  for (const grant of input.grants) {
    if (grant.policyId !== input.policyId) continue;
    if (new Date(grant.issuedAt).getTime() < windowStart) continue;
    if (grant.status === "revoked" || grant.status === "expired") continue;

    const settled = settledByCapability.get(grant.id);
    total += settled === undefined ? grant.scope.amountLimitMinor : settled;
  }

  return total;
}

export function windowStartIso(now: string, windowHours: number): string {
  return new Date(
    new Date(now).getTime() - windowHours * 60 * 60 * 1000,
  ).toISOString();
}
