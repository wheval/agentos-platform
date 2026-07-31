import type { Actor } from "@/domain/schemas";
import { describe, expect, it } from "vitest";
import {
  ORG_ID,
  buildAgent,
  buildHarness,
  buildPaymentInput,
  buildPolicy,
  expectOk,
} from "./fixtures";

const human: Actor = {
  type: "human",
  id: "usr_maya",
  displayName: "Maya Chen",
};

const agentActor: Actor = {
  type: "agent",
  id: "agt_finance",
  displayName: "Finance operator",
};

async function submit(harness: ReturnType<typeof buildHarness>, overrides = {}) {
  return harness.service.submitActionRequest({
    agentId: harness.agent.id,
    policyId: harness.policy.id,
    input: buildPaymentInput(overrides),
    actor: agentActor,
  });
}

describe("agent authentication", () => {
  it("resolves a valid key to its agent", async () => {
    const harness = buildHarness();
    const authenticated = expectOk(
      await harness.service.authenticateAgent(harness.apiKeySecret),
    );

    expect(authenticated.agentId).toBe("agt_finance");
    expect(authenticated.apiKey.prefix).toBe(harness.apiKeySecret.slice(0, 15));
  });

  it("rejects an unknown key", async () => {
    const harness = buildHarness();
    const result = await harness.service.authenticateAgent(
      "aos_sk_00000000_" + "0".repeat(48),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a malformed key without touching the store", async () => {
    const harness = buildHarness();
    const result = await harness.service.authenticateAgent("hunter2");

    expect(result.ok).toBe(false);
  });

  it("records rejected credentials in the audit ledger", async () => {
    const harness = buildHarness();
    await harness.service.authenticateAgent("aos_sk_deadbeef_" + "0".repeat(48));

    const events = await harness.store.listAuditEvents();

    expect(events.some((event) => event.eventType === "credential.rejected")).toBe(
      true,
    );
  });
});

describe("submitting an action request", () => {
  it("evaluates the policy and parks the request for approval", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    expect(request.state).toBe("pending_approval");
    expect(request.policyEvaluation?.status).toBe("requires_approval");
    expect(request.policyEvaluation?.reasonCodes).toEqual(["APPROVAL_REQUIRED"]);
    expect(request.organizationId).toBe(ORG_ID);
  });

  it("denies and closes a request that breaches the policy", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness, { amountMinor: 900_000 }));

    expect(request.state).toBe("denied");
    expect(request.policyEvaluation?.reasonCodes).toContain("AMOUNT_EXCEEDS_LIMIT");
  });

  it("skips human review for a request under standing authority", async () => {
    const harness = buildHarness({
      policy: buildPolicy({
        approvalRule: {
          threshold: 1,
          approverIds: ["usr_maya"],
          autoApproveBelowMinor: 5_000,
        },
      }),
    });
    const { request } = expectOk(await submit(harness, { amountMinor: 2_500 }));

    expect(request.state).toBe("approved");
  });

  it("refuses an unknown agent or policy", async () => {
    const harness = buildHarness();

    const unknownAgent = await harness.service.submitActionRequest({
      agentId: "agt_ghost",
      policyId: harness.policy.id,
      input: buildPaymentInput(),
      actor: agentActor,
    });
    const unknownPolicy = await harness.service.submitActionRequest({
      agentId: harness.agent.id,
      policyId: "pol_ghost",
      input: buildPaymentInput(),
      actor: agentActor,
    });

    expect(unknownAgent.ok === false && unknownAgent.error.code).toBe(
      "AGENT_NOT_FOUND",
    );
    expect(unknownPolicy.ok === false && unknownPolicy.error.code).toBe(
      "POLICY_NOT_FOUND",
    );
  });

  it("rejects a malformed payment input before it reaches the evaluator", async () => {
    const harness = buildHarness();
    const result = await harness.service.submitActionRequest({
      agentId: harness.agent.id,
      policyId: harness.policy.id,
      input: { ...buildPaymentInput(), amountMinor: -1 },
      actor: agentActor,
    });

    expect(result.ok === false && result.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("the approval gate", () => {
  it("issues no capability until the threshold is met", async () => {
    const harness = buildHarness({
      policy: buildPolicy({
        approvalRule: { threshold: 2, approverIds: ["usr_maya", "usr_omar"] },
      }),
    });
    const { request } = expectOk(await submit(harness));

    const first = expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    expect(first.request.state).toBe("pending_approval");

    const second = expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_omar",
        approverName: "Omar Haddad",
        decision: "approved",
      }),
    );

    expect(second.request.state).toBe("approved");
  });

  it("refuses an approver the policy does not name", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    const result = await harness.service.recordApproval({
      actionRequestId: request.id,
      approverId: "usr_stranger",
      approverName: "Stranger",
      decision: "approved",
    });

    expect(result.ok === false && result.error.code).toBe(
      "APPROVER_NOT_AUTHORIZED",
    );
  });

  it("closes the request on rejection", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    const rejected = expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "rejected",
        reason: "Vendor is under review.",
      }),
    );

    expect(rejected.request.state).toBe("denied");

    const issued = await harness.service.issueCapability({
      actionRequestId: request.id,
      actor: human,
    });

    expect(issued.ok === false && issued.error.code).toBe("INVALID_STATE");
  });

  it("refuses to approve a request that is not awaiting approval", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness, { amountMinor: 900_000 }));

    const result = await harness.service.recordApproval({
      actionRequestId: request.id,
      approverId: "usr_maya",
      approverName: "Maya Chen",
      decision: "approved",
    });

    expect(result.ok === false && result.error.code).toBe("INVALID_STATE");
  });
});

describe("capability issuance", () => {
  async function approvedHarness() {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    return { harness, requestId: request.id };
  }

  it("issues a grant scoped exactly to the approved request", async () => {
    const { harness, requestId } = await approvedHarness();
    const { capability, request } = expectOk(
      await harness.service.issueCapability({
        actionRequestId: requestId,
        actor: human,
      }),
    );

    expect(request.state).toBe("capability_issued");
    expect(capability.issuedToAgentId).toBe("agt_finance");
    expect(capability.scope).toEqual({
      actionKind: "capped_payment",
      resource: "treasury:operating",
      amountLimitMinor: 184_200,
      currency: "USD",
      counterpartyId: "cpty_acme",
    });
    expect(capability.usesRemaining).toBe(capability.maxUses);
  });

  it("expires the grant after the policy's capability TTL", async () => {
    const { harness, requestId } = await approvedHarness();
    const { capability } = expectOk(
      await harness.service.issueCapability({
        actionRequestId: requestId,
        actor: human,
      }),
    );

    const lifetimeSeconds =
      (new Date(capability.expiresAt).getTime() -
        new Date(capability.issuedAt).getTime()) /
      1000;

    expect(lifetimeSeconds).toBe(300);
  });

  it("refuses to issue twice for the same request", async () => {
    const { harness, requestId } = await approvedHarness();
    expectOk(
      await harness.service.issueCapability({
        actionRequestId: requestId,
        actor: human,
      }),
    );

    const second = await harness.service.issueCapability({
      actionRequestId: requestId,
      actor: human,
    });

    expect(second.ok === false && second.error.code).toBe("INVALID_STATE");
  });
});

describe("exercising a capability", () => {
  async function issuedHarness() {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    const { capability } = expectOk(
      await harness.service.issueCapability({
        actionRequestId: request.id,
        actor: human,
      }),
    );

    return { harness, capability, requestId: request.id };
  }

  it("settles once and marks the request succeeded", async () => {
    const { harness, capability, requestId } = await issuedHarness();
    const { receipt, request } = expectOk(
      await harness.service.executeCapability({
        capabilityId: capability.id,
        agentId: "agt_finance",
        idempotencyKey: "idem-invoice-1048",
        actor: agentActor,
      }),
    );

    expect(receipt.status).toBe("succeeded");
    expect(receipt.amountMinor).toBe(184_200);
    expect(request.state).toBe("succeeded");
    expect(request.id).toBe(requestId);

    const consumed = await harness.store.getCapability(capability.id);
    expect(consumed?.status).toBe("consumed");
    expect(consumed?.usesRemaining).toBe(0);
  });

  it("replays the original receipt for a repeated idempotency key", async () => {
    const { harness, capability } = await issuedHarness();
    const first = expectOk(
      await harness.service.executeCapability({
        capabilityId: capability.id,
        agentId: "agt_finance",
        idempotencyKey: "idem-invoice-1048",
        actor: agentActor,
      }),
    );
    const second = expectOk(
      await harness.service.executeCapability({
        capabilityId: capability.id,
        agentId: "agt_finance",
        idempotencyKey: "idem-invoice-1048",
        actor: agentActor,
      }),
    );

    expect(second.receipt).toEqual(first.receipt);
    expect(await harness.store.listReceipts()).toHaveLength(1);
  });

  it("refuses a short idempotency key", async () => {
    const { harness, capability } = await issuedHarness();
    const result = await harness.service.executeCapability({
      capabilityId: capability.id,
      agentId: "agt_finance",
      idempotencyKey: "short",
      actor: agentActor,
    });

    expect(result.ok === false && result.error.code).toBe("VALIDATION_FAILED");
  });

  it("refuses a different agent presenting the grant", async () => {
    const { harness, capability } = await issuedHarness();
    const result = await harness.service.executeCapability({
      capabilityId: capability.id,
      agentId: "agt_research",
      idempotencyKey: "idem-stolen-grant",
      actor: agentActor,
    });

    expect(result.ok === false && result.error.code).toBe("CAPABILITY_DENIED");
  });

  it("refuses an expired grant", async () => {
    const { harness, capability } = await issuedHarness();
    harness.advance(10);

    const result = await harness.service.executeCapability({
      capabilityId: capability.id,
      agentId: "agt_finance",
      idempotencyKey: "idem-too-late",
      actor: agentActor,
    });

    expect(result.ok === false && result.error.code).toBe("CAPABILITY_DENIED");
    expect(
      result.ok === false && (result.error.details?.reasons as string[]),
    ).toContain("CAPABILITY_EXPIRED");
  });

  it("refuses a grant that was revoked before use", async () => {
    const { harness, capability } = await issuedHarness();
    expectOk(
      await harness.service.revokeCapability({
        capabilityId: capability.id,
        actor: human,
        reason: "Invoice withdrawn by the vendor.",
      }),
    );

    const result = await harness.service.executeCapability({
      capabilityId: capability.id,
      agentId: "agt_finance",
      idempotencyKey: "idem-after-revoke",
      actor: agentActor,
    });

    expect(result.ok === false && result.error.code).toBe("CAPABILITY_DENIED");
  });

  it("refuses to revoke the same grant twice", async () => {
    const { harness, capability } = await issuedHarness();
    expectOk(
      await harness.service.revokeCapability({
        capabilityId: capability.id,
        actor: human,
        reason: "Invoice withdrawn.",
      }),
    );

    const second = await harness.service.revokeCapability({
      capabilityId: capability.id,
      actor: human,
      reason: "Invoice withdrawn.",
    });

    expect(second.ok === false && second.error.code).toBe("INVALID_STATE");
  });
});

describe("the audit ledger", () => {
  it("records the whole lifecycle in order", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    const { capability } = expectOk(
      await harness.service.issueCapability({
        actionRequestId: request.id,
        actor: human,
      }),
    );

    expectOk(
      await harness.service.executeCapability({
        capabilityId: capability.id,
        agentId: "agt_finance",
        idempotencyKey: "idem-invoice-1048",
        actor: agentActor,
      }),
    );

    const types = (await harness.store.listAuditEvents()).map(
      (event) => event.eventType,
    );

    expect(types).toContain("action.requested");
    expect(types).toContain("policy.evaluated");
    expect(types).toContain("approval.recorded");
    expect(types).toContain("capability.issued");
    expect(types).toContain("action.executed");
  });

  it("attributes every event to the actor that caused it", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    const events = await harness.store.listAuditEvents();
    const approval = events.find((event) => event.eventType === "approval.recorded");

    expect(approval?.actor).toEqual({
      type: "human",
      id: "usr_maya",
      displayName: "Maya Chen",
    });
  });

  it("records a denial as denied", async () => {
    const harness = buildHarness();
    await submit(harness, { amountMinor: 900_000 });

    const denial = (await harness.store.listAuditEvents()).find(
      (event) => event.eventType === "policy.evaluated",
    );

    expect(denial?.outcome).toBe("denied");
  });
});

describe("proof anchoring", () => {
  it("anchors the approval decision with commitments only", async () => {
    const harness = buildHarness();
    const { request } = expectOk(await submit(harness));

    expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    expect(harness.anchor.decisions).toHaveLength(1);

    const [anchored] = harness.anchor.decisions;
    expect(anchored?.outcome).toBe("approved");
    expect(anchored?.policyCommitment).toMatch(/^[a-f0-9]{64}$/);
    expect(anchored?.decisionNullifier).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(anchored)).not.toContain("Acme Cloud");
    expect(JSON.stringify(anchored)).not.toContain("184200");
  });

  it("does not fail the decision when the anchor is unavailable", async () => {
    const harness = buildHarness({ anchorAccepted: false });
    const { request } = expectOk(await submit(harness));

    const approved = expectOk(
      await harness.service.recordApproval({
        actionRequestId: request.id,
        approverId: "usr_maya",
        approverName: "Maya Chen",
        decision: "approved",
      }),
    );

    expect(approved.request.state).toBe("approved");

    const events = await harness.store.listAuditEvents();
    expect(events.some((event) => event.eventType === "proof.failed")).toBe(true);
  });
});

describe("rolling spend windows end to end", () => {
  const windowedPolicy = buildPolicy({
    constraints: {
      currency: "USD",
      maxAmountMinor: 100_000,
      approvedCounterpartyIds: ["cpty_acme"],
      resource: "treasury:operating",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      capabilityTtlSeconds: 300,
      spendWindow: { windowHours: 168, maxAmountMinor: 150_000 },
    },
    approvalRule: { threshold: 0, approverIds: [] },
  });

  it("counts a live grant against the window before it is redeemed", async () => {
    const harness = buildHarness({ policy: windowedPolicy });

    const first = expectOk(await submit(harness, { amountMinor: 100_000 }));
    expectOk(
      await harness.service.issueCapability({
        actionRequestId: first.request.id,
        actor: human,
      }),
    );

    const second = expectOk(await submit(harness, { amountMinor: 100_000 }));

    expect(second.request.state).toBe("denied");
    expect(second.request.policyEvaluation?.reasonCodes).toContain(
      "SPEND_WINDOW_EXCEEDED",
    );
    expect(second.request.policyEvaluation?.spendWindow?.priorSpendMinor).toBe(
      100_000,
    );
  });

  it("returns the budget when the grant is revoked", async () => {
    const harness = buildHarness({ policy: windowedPolicy });

    const first = expectOk(await submit(harness, { amountMinor: 100_000 }));
    const { capability } = expectOk(
      await harness.service.issueCapability({
        actionRequestId: first.request.id,
        actor: human,
      }),
    );

    expectOk(
      await harness.service.revokeCapability({
        capabilityId: capability.id,
        actor: human,
        reason: "Order cancelled.",
      }),
    );

    const second = expectOk(await submit(harness, { amountMinor: 100_000 }));

    expect(second.request.state).toBe("approved");
    expect(second.request.policyEvaluation?.spendWindow?.priorSpendMinor).toBe(0);
  });
});

describe("agent permissions", () => {
  it("denies an agent whose job description does not include the action", async () => {
    const harness = buildHarness({
      agent: buildAgent({ permissions: [] }),
    });
    const { request } = expectOk(await submit(harness));

    expect(request.state).toBe("denied");
    expect(request.policyEvaluation?.reasonCodes).toContain(
      "AGENT_NOT_AUTHORIZED",
    );
  });

  it("denies a paused agent", async () => {
    const harness = buildHarness({ agent: buildAgent({ status: "paused" }) });
    const { request } = expectOk(await submit(harness));

    expect(request.policyEvaluation?.reasonCodes).toContain("AGENT_INACTIVE");
  });
});
