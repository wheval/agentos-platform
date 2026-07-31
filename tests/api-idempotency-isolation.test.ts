import { POST as executeRoute } from "@/app/api/v1/capabilities/[id]/execute/route";
import { POST as claimRoute } from "@/app/api/v1/action-requests/[id]/capability/route";
import { POST as submitRoute } from "@/app/api/v1/action-requests/route";
import { getWorkspace } from "@/lib/workspace";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The service-level suite proves the isolation rule. This one proves the rule
 * survives the surface an attacker actually reaches: an HTTP request carrying
 * someone else's idempotency key and an agent's own API key.
 *
 * It drives the real route handlers against the real seeded workspace, so a
 * regression in the route, the auth layer, the status mapping or the service
 * all fail here.
 */

const SHARED_KEY = "idem-shared-key-0001";

function keyFor(agentId: string): string {
  const key = getWorkspace().bootstrapApiKeys.find(
    (candidate) => candidate.agentId === agentId,
  );

  if (!key) throw new Error(`no bootstrap key seeded for ${agentId}`);

  return key.secret;
}

function post(url: string, secret: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Auto-approves under `pol_research_tools`, so no operator step is needed. */
function researchPayment(reference: string) {
  return {
    policyId: "pol_research_tools",
    amountMinor: 200,
    currency: "USD",
    counterpartyId: "cpty_serpstack",
    counterpartyName: "Serpstack",
    resource: "treasury:research",
    reference,
    context: `Metered search credits for ${reference}`,
  };
}

async function claimGrant(agentId: string, reference: string) {
  const secret = keyFor(agentId);

  const submitted = await submitRoute(
    post("http://localhost/api/v1/action-requests", secret, researchPayment(reference)),
  );
  const submitBody = await submitted.json();

  expect(submitted.status, JSON.stringify(submitBody)).toBe(201);

  const requestId = submitBody.request.id;

  const claimed = await claimRoute(
    post(
      `http://localhost/api/v1/action-requests/${requestId}/capability`,
      secret,
      {},
    ),
    { params: Promise.resolve({ id: requestId }) },
  );
  const claimBody = await claimed.json();

  expect(claimed.status, JSON.stringify(claimBody)).toBe(200);

  return {
    secret,
    requestId,
    capabilityId: claimBody.capability.id as string,
  };
}

async function execute(
  secret: string,
  capabilityId: string,
  idempotencyKey: string,
) {
  const response = await executeRoute(
    post(
      `http://localhost/api/v1/capabilities/${capabilityId}/execute`,
      secret,
      { idempotencyKey },
    ),
    { params: Promise.resolve({ id: capabilityId }) },
  );

  return { status: response.status, body: await response.json() };
}

describe("POST /api/v1/capabilities/:id/execute idempotency isolation", () => {
  let victim: Awaited<ReturnType<typeof claimGrant>>;
  let victimReceiptId: string;

  beforeAll(async () => {
    victim = await claimGrant("agt_research", "INV-VICTIM");

    const executed = await execute(
      victim.secret,
      victim.capabilityId,
      SHARED_KEY,
    );

    expect(executed.status).toBe(200);
    victimReceiptId = executed.body.receipt.id;
  });

  it("replays for the agent that owns the key", async () => {
    const replay = await execute(victim.secret, victim.capabilityId, SHARED_KEY);

    expect(replay.status).toBe(200);
    expect(replay.body.receipt.id).toBe(victimReceiptId);
  });

  it("does not surrender the receipt to another agent holding the same key", async () => {
    const attacker = await claimGrant("agt_finance", "INV-ATTACKER");

    // The attacker names their own capability but presents the victim's key.
    const stolen = await execute(
      attacker.secret,
      attacker.capabilityId,
      SHARED_KEY,
    );

    // They execute their own capability normally: keys are namespaced per
    // agent, so reusing the string is not itself an error.
    expect(stolen.status).toBe(200);
    expect(stolen.body.receipt.id).not.toBe(victimReceiptId);
    expect(stolen.body.receipt.agentId).toBe("agt_finance");
    expect(stolen.body.request.id).toBe(attacker.requestId);
    expect(JSON.stringify(stolen.body)).not.toContain(victim.capabilityId);
  });

  it("does not let another agent redeem the victim's capability with the key", async () => {
    // A fresh agent that has never used this key, so the lookup simply does not
    // resolve for them and the ownership check is what refuses.
    const attacker = await claimGrant("agt_operations", "INV-ATTACKER-2");

    const stolen = await execute(
      attacker.secret,
      victim.capabilityId,
      SHARED_KEY,
    );

    expect(stolen.status).toBe(403);
    expect(JSON.stringify(stolen.body)).not.toContain(victimReceiptId);
    expect(JSON.stringify(stolen.body)).not.toContain("INV-VICTIM");
    expect(attacker.capabilityId).not.toBe(victim.capabilityId);
  });

  it("refuses when an agent points its own key at a capability it did not name", async () => {
    // `agt_finance` bound this key to its own grant in the previous test, so
    // reusing it against a different capability is a conflict, not a replay.
    const attacker = await claimGrant("agt_finance", "INV-ATTACKER-3");

    const reused = await execute(
      attacker.secret,
      attacker.capabilityId,
      SHARED_KEY,
    );

    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(JSON.stringify(reused.body)).not.toContain(victimReceiptId);
  });
});
