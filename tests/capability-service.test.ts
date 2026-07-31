import { authorizeCapabilityUse } from "@/application/capability-service";
import { describe, expect, it } from "vitest";
import { buildCapability } from "./fixtures";

const validAttempt = {
  agentId: "agt_finance",
  actionRequestId: "req_invoice_1048",
  actionKind: "capped_payment" as const,
  resource: "treasury:operating",
  amountMinor: 184_200,
  currency: "USD" as const,
  counterpartyId: "cpty_acme",
};

describe("authorizeCapabilityUse", () => {
  it("authorizes an in-scope use before expiry", () => {
    expect(
      authorizeCapabilityUse(
        buildCapability(),
        validAttempt,
        "2026-07-31T12:05:00.000Z",
      ),
    ).toEqual({ authorized: true, reasons: [] });
  });

  it("rejects use at the exact expiry boundary", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      validAttempt,
      "2026-07-31T12:07:00.000Z",
    );

    expect(result).toEqual({
      authorized: false,
      reasons: ["CAPABILITY_EXPIRED"],
    });
  });

  it("rejects an amount above the grant and a different counterparty", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      {
        ...validAttempt,
        amountMinor: 184_201,
        counterpartyId: "cpty_other",
      },
      "2026-07-31T12:05:00.000Z",
    );

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "AMOUNT_SCOPE_EXCEEDED",
        "COUNTERPARTY_SCOPE_MISMATCH",
      ]),
    );
  });

  it("rejects a different agent or action request", () => {
    const result = authorizeCapabilityUse(
      buildCapability(),
      {
        ...validAttempt,
        agentId: "agt_operations",
        actionRequestId: "req_other",
      },
      "2026-07-31T12:05:00.000Z",
    );

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "AGENT_SCOPE_MISMATCH",
        "REQUEST_SCOPE_MISMATCH",
      ]),
    );
  });
});
