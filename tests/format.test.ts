import { describe, expect, it } from "vitest";
import { effectiveCapabilityStatus } from "@/components/format";

const NOW = new Date("2026-07-31T12:00:00.000Z");

describe("effectiveCapabilityStatus", () => {
  it("treats an active capability past its expiry as expired", () => {
    expect(
      effectiveCapabilityStatus(
        {
          status: "active",
          expiresAt: "2026-07-31T11:59:59.000Z",
        },
        NOW,
      ),
    ).toBe("expired");
  });

  it("keeps future and terminal capability states unchanged", () => {
    expect(
      effectiveCapabilityStatus(
        {
          status: "active",
          expiresAt: "2026-07-31T12:00:01.000Z",
        },
        NOW,
      ),
    ).toBe("active");
    expect(
      effectiveCapabilityStatus(
        {
          status: "consumed",
          expiresAt: "2026-07-31T11:59:59.000Z",
        },
        NOW,
      ),
    ).toBe("consumed");
  });
});
