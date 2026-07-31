import {
  computeCommittedSpendMinor,
  windowStartIso,
} from "@/application/spend-window";
import { describe, expect, it } from "vitest";
import { NOW, buildCapability, buildReceipt, isoAt } from "./fixtures";

const POLICY_ID = "pol_vendor_payment";
const WINDOW_START = isoAt(-60);

function committed(
  grants: Parameters<typeof computeCommittedSpendMinor>[0]["grants"],
  receipts: Parameters<typeof computeCommittedSpendMinor>[0]["receipts"] = [],
) {
  return computeCommittedSpendMinor({
    grants,
    receipts,
    policyId: POLICY_ID,
    windowStart: WINDOW_START,
  });
}

describe("computeCommittedSpendMinor", () => {
  it("counts a live but unredeemed grant at its full ceiling", () => {
    expect(committed([buildCapability()])).toBe(184_200);
  });

  it("counts what actually settled once a grant has been redeemed", () => {
    const spend = committed(
      [buildCapability({ status: "consumed", usesRemaining: 0 })],
      [buildReceipt({ amountMinor: 100_000 })],
    );

    expect(spend).toBe(100_000);
  });

  it("counts a grant exactly once even with several settled receipts", () => {
    const spend = committed(
      [buildCapability({ maxUses: 3, usesRemaining: 1 })],
      [
        buildReceipt({ id: "rcp_a", idempotencyKey: "idem-key-a", amountMinor: 40_000 }),
        buildReceipt({ id: "rcp_b", idempotencyKey: "idem-key-b", amountMinor: 60_000 }),
      ],
    );

    expect(spend).toBe(100_000);
  });

  it("ignores failed executions and falls back to the ceiling", () => {
    const spend = committed(
      [buildCapability()],
      [
        buildReceipt({
          status: "failed",
          failureReason: "Sandbox declined",
          providerReference: undefined,
        }),
      ],
    );

    expect(spend).toBe(184_200);
  });

  it("releases budget when a grant is revoked", () => {
    const spend = committed([
      buildCapability({
        status: "revoked",
        revokedAt: isoAt(4),
        revokedReason: "No longer needed",
      }),
    ]);

    expect(spend).toBe(0);
  });

  it("releases budget when a grant expires unused", () => {
    expect(committed([buildCapability({ status: "expired" })])).toBe(0);
  });

  it("ignores grants issued under a different policy", () => {
    const spend = committed([
      buildCapability({ id: "cap_other", policyId: "pol_other" }),
    ]);

    expect(spend).toBe(0);
  });

  it("ignores grants issued before the window opened", () => {
    const spend = committed([
      buildCapability({ issuedAt: isoAt(-600), expiresAt: isoAt(-595) }),
    ]);

    expect(spend).toBe(0);
  });

  it("sums several live grants", () => {
    const spend = committed([
      buildCapability(),
      buildCapability({
        id: "cap_second",
        actionRequestId: "req_invoice_1049",
        scope: {
          actionKind: "capped_payment",
          resource: "treasury:operating",
          amountLimitMinor: 20_000,
          currency: "USD",
          counterpartyId: "cpty_acme",
        },
      }),
    ]);

    expect(spend).toBe(204_200);
  });

  it("returns zero when nothing has been granted", () => {
    expect(committed([])).toBe(0);
  });
});

describe("windowStartIso", () => {
  it("subtracts the window length from now", () => {
    expect(windowStartIso(NOW, 24)).toBe("2026-07-30T12:00:00.000Z");
    expect(windowStartIso(NOW, 168)).toBe("2026-07-24T12:00:00.000Z");
  });
});
