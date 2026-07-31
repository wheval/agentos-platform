import type { CapabilityGrant, ExecutionReceipt } from "@/domain/schemas";

export type SpendWindowInput = {
  grants: CapabilityGrant[];
  receipts: ExecutionReceipt[];
  policyId: string;
  windowStart: string;
  now: string;
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
 *  - a grant with settled executions contributes what actually settled, whatever
 *    its status is now, because that money moved and revoking a grant afterwards
 *    does not bring it back;
 *  - an unredeemed grant contributes its ceiling — the most it could still cost —
 *    but only while it remains live;
 *  - an unredeemed grant that was revoked, or whose expiry has passed,
 *    contributes nothing, because the authority was withdrawn before it was used.
 *
 * Expiry is derived from `expiresAt` against `now`, not from `status` alone.
 * Nothing sweeps grants the moment they lapse, so a grant that expired seconds
 * ago is still stored as active; trusting the field would hold budget hostage
 * to a background job that does not exist.
 *
 * Failed executions contribute nothing, because no value moved.
 */
export function computeCommittedSpendMinor(input: SpendWindowInput): number {
  const windowStart = new Date(input.windowStart).getTime();
  const nowMs = new Date(input.now).getTime();
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

    const settled = settledByCapability.get(grant.id);

    if (settled !== undefined) {
      total += settled;
      continue;
    }

    if (grant.status === "revoked" || grant.status === "expired") continue;
    if (new Date(grant.expiresAt).getTime() <= nowMs) continue;

    total += grant.scope.amountLimitMinor;
  }

  return total;
}

export function windowStartIso(now: string, windowHours: number): string {
  return new Date(
    new Date(now).getTime() - windowHours * 60 * 60 * 1000,
  ).toISOString();
}
