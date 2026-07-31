import {
  authorizeCapabilityUse,
  type CapabilityUseAttempt,
} from "@/application/capability-service";
import { CapabilityGrantSchema } from "@/domain/schemas";
import { describe, expect, it } from "vitest";
import { buildCapability, isoAt } from "./fixtures";

const attempt: CapabilityUseAttempt = {
  agentId: "agt_finance",
  actionRequestId: "req_invoice_1048",
  actionKind: "capped_payment",
  resource: "treasury:operating",
  amountMinor: 184_200,
  currency: "USD",
  counterpartyId: "cpty_acme",
};

/** Inside the grant's five-minute window: issued at +2, expires at +7. */
const DURING = isoAt(4);

describe("authorizeCapabilityUse", () => {
  it("authorizes a use that matches every dimension of the scope", () => {
    const result = authorizeCapabilityUse(buildCapability(), attempt, DURING);

    expect(result.authorized).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("authorizes an amount below the ceiling", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      { ...attempt, amountMinor: 1 },
      DURING,
    );

    expect(result.authorized).toBe(true);
  });
});

describe("capability expiry", () => {
  it("denies use after the expiry instant", () => {
    const result = authorizeCapabilityUse(buildCapability(), attempt, isoAt(8));

    expect(result.authorized).toBe(false);
    expect(result.reasons).toContain("CAPABILITY_EXPIRED");
  });

  it("treats the expiry instant itself as expired", () => {
    const result = authorizeCapabilityUse(buildCapability(), attempt, isoAt(7));

    expect(result.reasons).toContain("CAPABILITY_EXPIRED");
  });

  it("denies use before the grant exists", () => {
    const result = authorizeCapabilityUse(buildCapability(), attempt, isoAt(1));

    expect(result.reasons).toContain("CAPABILITY_NOT_YET_VALID");
  });
});

describe("capability status and budget", () => {
  it.each(["revoked", "consumed", "expired"] as const)(
    "denies a %s grant",
    (status) => {
      const result = authorizeCapabilityUse(
        buildCapability({
          status,
          ...(status === "revoked"
            ? { revokedAt: isoAt(3), revokedReason: "Vendor dispute" }
            : {}),
        }),
        attempt,
        DURING,
      );

      expect(result.authorized).toBe(false);
      expect(result.reasons).toContain("CAPABILITY_NOT_ACTIVE");
    },
  );

  it("denies use once the grant's uses are exhausted", () => {
    const result = authorizeCapabilityUse(
      buildCapability({ maxUses: 3, usesRemaining: 0 }),
      attempt,
      DURING,
    );

    expect(result.reasons).toContain("CAPABILITY_USES_EXHAUSTED");
  });
});

describe("capability scope", () => {
  it("denies a different agent holding a stolen grant", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      { ...attempt, agentId: "agt_research" },
      DURING,
    );

    expect(result.reasons).toContain("AGENT_SCOPE_MISMATCH");
  });

  it("denies replay against a different action request", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      { ...attempt, actionRequestId: "req_other_9999" },
      DURING,
    );

    expect(result.reasons).toContain("REQUEST_SCOPE_MISMATCH");
  });

  it("denies an amount one minor unit over the ceiling", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      { ...attempt, amountMinor: 184_201 },
      DURING,
    );

    expect(result.reasons).toContain("AMOUNT_SCOPE_EXCEEDED");
  });

  it("denies a redirected counterparty", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      { ...attempt, counterpartyId: "cpty_attacker" },
      DURING,
    );

    expect(result.reasons).toContain("COUNTERPARTY_SCOPE_MISMATCH");
  });

  it("denies a different currency and a different resource", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      { ...attempt, currency: "EUR", resource: "treasury:capex" },
      DURING,
    );

    expect(result.reasons).toContain("CURRENCY_SCOPE_MISMATCH");
    expect(result.reasons).toContain("RESOURCE_SCOPE_MISMATCH");
  });

  it("reports every violated dimension at once", () => {
    const result = authorizeCapabilityUse(
      buildCapability({ status: "revoked", revokedAt: isoAt(3), revokedReason: "x" }),
      {
        agentId: "agt_research",
        actionRequestId: "req_other_9999",
        actionKind: "capped_payment",
        resource: "treasury:capex",
        amountMinor: 999_999,
        currency: "EUR",
        counterpartyId: "cpty_attacker",
      },
      isoAt(30),
    );

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "CAPABILITY_NOT_ACTIVE",
        "CAPABILITY_EXPIRED",
        "AGENT_SCOPE_MISMATCH",
        "REQUEST_SCOPE_MISMATCH",
        "RESOURCE_SCOPE_MISMATCH",
        "AMOUNT_SCOPE_EXCEEDED",
        "CURRENCY_SCOPE_MISMATCH",
        "COUNTERPARTY_SCOPE_MISMATCH",
      ]),
    );
  });
});

describe("capability invariants", () => {
  it("rejects a grant that expires before it is issued", () => {
    expect(() =>
      CapabilityGrantSchema.parse({
        ...buildCapability(),
        issuedAt: isoAt(10),
        expiresAt: isoAt(5),
      }),
    ).toThrow(/expiry must be after issuance/i);
  });

  it("rejects a grant with more remaining uses than it was granted", () => {
    expect(() =>
      CapabilityGrantSchema.parse({
        ...buildCapability(),
        maxUses: 1,
        usesRemaining: 2,
      }),
    ).toThrow(/cannot exceed the granted maximum/i);
  });
});
