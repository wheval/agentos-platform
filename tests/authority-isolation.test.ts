import { describe, expect, it } from "vitest";
import {
  buildAgent,
  buildHarness,
  buildPaymentInput,
  buildPolicy,
  expectOk,
} from "./fixtures";
import type { AuthorityService } from "@/application/authority-service";
import type { Actor } from "@/domain/schemas";

/**
 * Regression coverage for two ways the control plane could hand out authority
 * it never meant to grant. Both were found in review of the product surface,
 * and both are the kind of bug that unit tests pass straight over unless the
 * test deliberately plays the attacker.
 */

const FINANCE = buildAgent();
const RIVAL = buildAgent({
  id: "agt_rival",
  name: "Rival operator",
  managerId: "usr_omar",
  managerName: "Omar Diaz",
});

function actorFor(agentId: string, name: string): Actor {
  return { type: "agent", id: agentId, displayName: name };
}

/** Standing authority high enough that these tests reach execution in one pass. */
function autoApprovingPolicy(overrides: { spendWindowMaxMinor?: number } = {}) {
  const base = buildPolicy();

  return buildPolicy({
    approvalRule: { ...base.approvalRule, autoApproveBelowMinor: 250_000 },
    constraints: overrides.spendWindowMaxMinor
      ? {
          ...base.constraints,
          spendWindow: {
            windowHours: 168,
            maxAmountMinor: overrides.spendWindowMaxMinor,
          },
        }
      : base.constraints,
  });
}

/** Drives submit → (approve) → issue and returns the grant an agent holds. */
async function grantFor(
  service: AuthorityService,
  agentId: string,
  agentName: string,
  overrides: Partial<ReturnType<typeof buildPaymentInput>> = {},
) {
  const actor = actorFor(agentId, agentName);
  const submitted = expectOk(
    await service.submitActionRequest({
      agentId,
      policyId: "pol_vendor_payment",
      input: buildPaymentInput(overrides),
      actor,
    }),
  );

  let request = submitted.request;

  if (request.state === "pending_approval") {
    request = expectOk(
      await service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    ).request;
  }

  const issued = expectOk(
    await service.issueCapability({ actionRequestId: request.id, actor }),
  );

  return issued.capability;
}

describe("idempotency keys are scoped to the agent that used them", () => {
  /**
   * The original replay branch looked receipts up by key alone and returned
   * before any authorization ran. Any authenticated agent could present a key
   * belonging to someone else and be handed that agent's receipt and full
   * request — counterparty, amount, reference — without holding the capability.
   */
  it("does not hand a stored receipt to a different agent presenting the same key", async () => {
    const harness = buildHarness({
      extraAgents: [RIVAL],
      // No approval step, so both agents can reach execution in one pass.
      policy: autoApprovingPolicy(),
    });

    const victimGrant = await grantFor(harness.service, FINANCE.id, FINANCE.name);
    const attackerGrant = await grantFor(harness.service, RIVAL.id, RIVAL.name, {
      amountMinor: 1_000,
      reference: "INV-RIVAL",
      counterpartyName: "Rival Vendor",
    });

    const sharedKey = "idem-shared-key-0001";

    const victim = expectOk(
      await harness.service.executeCapability({
        capabilityId: victimGrant.id,
        agentId: FINANCE.id,
        idempotencyKey: sharedKey,
        actor: actorFor(FINANCE.id, FINANCE.name),
      }),
    );

    expect(victim.receipt.amountMinor).toBe(184_200);

    // The attacker reuses the victim's key against their own valid grant.
    const attacker = expectOk(
      await harness.service.executeCapability({
        capabilityId: attackerGrant.id,
        agentId: RIVAL.id,
        idempotencyKey: sharedKey,
        actor: actorFor(RIVAL.id, RIVAL.name),
      }),
    );

    // They get their own execution, not the victim's receipt.
    expect(attacker.receipt.id).not.toBe(victim.receipt.id);
    expect(attacker.receipt.agentId).toBe(RIVAL.id);
    expect(attacker.receipt.amountMinor).toBe(1_000);
    expect(attacker.request.id).not.toBe(victim.request.id);
    expect(attacker.request.agentId).toBe(RIVAL.id);
    expect(attacker.request.input.reference).toBe("INV-RIVAL");
    expect(attacker.request.input.counterpartyName).not.toBe("Acme Cloud");

    // And the victim's receipt is untouched and still replays for its owner.
    const replay = expectOk(
      await harness.service.executeCapability({
        capabilityId: victimGrant.id,
        agentId: FINANCE.id,
        idempotencyKey: sharedKey,
        actor: actorFor(FINANCE.id, FINANCE.name),
      }),
    );

    expect(replay.receipt.id).toBe(victim.receipt.id);
  });

  it("does not let a foreign key stand in for a capability the caller lacks", async () => {
    const harness = buildHarness({
      extraAgents: [RIVAL],
      policy: autoApprovingPolicy(),
    });

    const victimGrant = await grantFor(harness.service, FINANCE.id, FINANCE.name);
    const sharedKey = "idem-shared-key-0002";

    expectOk(
      await harness.service.executeCapability({
        capabilityId: victimGrant.id,
        agentId: FINANCE.id,
        idempotencyKey: sharedKey,
        actor: actorFor(FINANCE.id, FINANCE.name),
      }),
    );

    // The attacker names the victim's capability directly, with the key that
    // would previously have short-circuited authorization entirely.
    const stolen = await harness.service.executeCapability({
      capabilityId: victimGrant.id,
      agentId: RIVAL.id,
      idempotencyKey: sharedKey,
      actor: actorFor(RIVAL.id, RIVAL.name),
    });

    expect(stolen.ok).toBe(false);

    if (!stolen.ok) {
      // Refused on the grant not belonging to them, which is what a caller
      // learns whether or not the key exists for anyone else.
      expect(stolen.error.code).toBe("CAPABILITY_DENIED");
      expect(JSON.stringify(stolen.error)).not.toContain("Acme Cloud");
      expect(JSON.stringify(stolen.error)).not.toContain("184200");
    }
  });

  it("refuses to replay one agent's key against a different capability of its own", async () => {
    const harness = buildHarness({
      policy: autoApprovingPolicy({ spendWindowMaxMinor: 2_000_000 }),
    });

    const first = await grantFor(harness.service, FINANCE.id, FINANCE.name);
    const second = await grantFor(harness.service, FINANCE.id, FINANCE.name, {
      amountMinor: 5_000,
      reference: "INV-SECOND",
    });

    const key = "idem-same-agent-0003";

    expectOk(
      await harness.service.executeCapability({
        capabilityId: first.id,
        agentId: FINANCE.id,
        idempotencyKey: key,
        actor: actorFor(FINANCE.id, FINANCE.name),
      }),
    );

    const mismatched = await harness.service.executeCapability({
      capabilityId: second.id,
      agentId: FINANCE.id,
      idempotencyKey: key,
      actor: actorFor(FINANCE.id, FINANCE.name),
    });

    expect(mismatched.ok).toBe(false);

    if (!mismatched.ok) {
      expect(mismatched.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    }

    // The second grant was not silently spent by the refused call.
    const stored = await harness.store.getCapability(second.id);
    expect(stored?.usesRemaining).toBe(1);
  });
});

describe("rolling spend windows are enforced when authority is minted", () => {
  const windowedPolicy = buildPolicy({
    constraints: {
      ...buildPolicy().constraints,
      maxAmountMinor: 100_000,
      spendWindow: { windowHours: 168, maxAmountMinor: 150_000 },
    },
    approvalRule: {
      ...buildPolicy().approvalRule,
      autoApproveBelowMinor: 100_000,
    },
  });

  /**
   * Submission checks a budget nothing has reserved yet. Three requests can each
   * be evaluated against committed=0 and all auto-approve; if issuance never
   * re-checks, all three then mint grants and the window is blown.
   */
  it("refuses the claim that would oversubscribe the window", async () => {
    const harness = buildHarness({ policy: windowedPolicy });
    const actor = actorFor(FINANCE.id, FINANCE.name);

    const submit = async (reference: string) =>
      expectOk(
        await harness.service.submitActionRequest({
          agentId: FINANCE.id,
          policyId: windowedPolicy.id,
          input: buildPaymentInput({ amountMinor: 90_000, reference }),
          actor,
        }),
      ).request;

    // Both are approved before either is claimed — the race the fix closes.
    const first = await submit("INV-A");
    const second = await submit("INV-B");

    expect(first.state).toBe("approved");
    expect(second.state).toBe("approved");

    const firstGrant = await harness.service.issueCapability({
      actionRequestId: first.id,
      actor,
    });

    expect(firstGrant.ok).toBe(true);

    // 90_000 committed + 90_000 requested > 150_000.
    const secondGrant = await harness.service.issueCapability({
      actionRequestId: second.id,
      actor,
    });

    expect(secondGrant.ok).toBe(false);

    if (!secondGrant.ok) {
      expect(secondGrant.error.code).toBe("CAPABILITY_DENIED");
      expect(secondGrant.error.details).toMatchObject({
        reasons: ["SPEND_WINDOW_EXCEEDED"],
        committedMinor: 90_000,
        requestedMinor: 90_000,
        windowMaxMinor: 150_000,
      });
    }

    // No grant was minted for the refused request, and it stays approved so it
    // can be claimed once the window rolls.
    const capabilities = await harness.store.listCapabilities();
    expect(capabilities).toHaveLength(1);
    expect((await harness.store.getActionRequest(second.id))?.state).toBe("approved");
  });

  it("records the refusal in the audit ledger", async () => {
    const harness = buildHarness({ policy: windowedPolicy });
    const actor = actorFor(FINANCE.id, FINANCE.name);

    const submit = async (reference: string) =>
      expectOk(
        await harness.service.submitActionRequest({
          agentId: FINANCE.id,
          policyId: windowedPolicy.id,
          input: buildPaymentInput({ amountMinor: 90_000, reference }),
          actor,
        }),
      ).request;

    const first = await submit("INV-A");
    const second = await submit("INV-B");

    await harness.service.issueCapability({ actionRequestId: first.id, actor });
    await harness.service.issueCapability({ actionRequestId: second.id, actor });

    const events = await harness.store.listAuditEvents();
    const denial = events.find(
      (event) => event.eventType === "capability.issued" && event.outcome === "denied",
    );

    expect(denial).toBeDefined();
    expect(denial?.actionRequestId).toBe(second.id);
    expect(denial?.metadata.reasons).toBe("SPEND_WINDOW_EXCEEDED");
  });

  it("returns budget when a live grant is revoked", async () => {
    const harness = buildHarness({ policy: windowedPolicy });
    const actor = actorFor(FINANCE.id, FINANCE.name);

    const submit = async (reference: string) =>
      expectOk(
        await harness.service.submitActionRequest({
          agentId: FINANCE.id,
          policyId: windowedPolicy.id,
          input: buildPaymentInput({ amountMinor: 90_000, reference }),
          actor,
        }),
      ).request;

    const first = await submit("INV-A");
    const second = await submit("INV-B");

    const firstGrant = expectOk(
      await harness.service.issueCapability({ actionRequestId: first.id, actor }),
    );

    expect(
      (await harness.service.issueCapability({ actionRequestId: second.id, actor })).ok,
    ).toBe(false);

    await harness.service.revokeCapability({
      capabilityId: firstGrant.capability.id,
      actor: { type: "human", id: "usr_maya", displayName: "Maya Chen" },
      reason: "Vendor invoice withdrawn",
    });

    // The withdrawn authority frees the budget it was holding.
    expect(
      (await harness.service.issueCapability({ actionRequestId: second.id, actor })).ok,
    ).toBe(true);
  });

  it("returns budget once an unredeemed grant passes its expiry", async () => {
    const harness = buildHarness({ policy: windowedPolicy });
    const actor = actorFor(FINANCE.id, FINANCE.name);

    const submit = async (reference: string) =>
      expectOk(
        await harness.service.submitActionRequest({
          agentId: FINANCE.id,
          policyId: windowedPolicy.id,
          input: buildPaymentInput({ amountMinor: 90_000, reference }),
          actor,
        }),
      ).request;

    const first = await submit("INV-A");
    const second = await submit("INV-B");

    expectOk(await harness.service.issueCapability({ actionRequestId: first.id, actor }));

    expect(
      (await harness.service.issueCapability({ actionRequestId: second.id, actor })).ok,
    ).toBe(false);

    // The grant lapses on its own. Nothing sweeps it, so its stored status is
    // still "active" — the budget must come back from the expiry timestamp.
    harness.advance(10);

    const lapsed = await harness.store.listCapabilities();
    expect(lapsed[0]?.status).toBe("active");

    expect(
      (await harness.service.issueCapability({ actionRequestId: second.id, actor })).ok,
    ).toBe(true);
  });
});
