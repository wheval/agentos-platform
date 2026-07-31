import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBlueprintSchema, type AgentBlueprint } from "@/domain/blueprint";
import type { Workspace } from "@/lib/workspace";
import { buildAgent, buildHarness, ORG_ID } from "./fixtures";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/operator-session", () => ({
  readOperatorSession: vi.fn(async () => ({
    authenticated: true,
    mode: "demo",
    issuedAt: 0,
  })),
}));

vi.mock("@/lib/workspace", () => ({
  getWorkspace: vi.fn(),
}));

import { saveBlueprintAction } from "@/app/console/actions";
import { getWorkspace } from "@/lib/workspace";

const NOW = "2026-07-31T12:00:00.000Z";

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return AgentBlueprintSchema.parse({
    id: "bp_action_test",
    organizationId: ORG_ID,
    name: "Action boundary flow",
    summary: "Exercises the server-side blueprint publication boundary.",
    agentId: "agt_finance",
    status: "draft",
    trigger: { kind: "manual", label: "Operator starts the flow" },
    steps: [
      {
        kind: "policy_gate",
        id: "nd_gate",
        policyId: "pol_vendor_payment",
      },
      {
        kind: "action",
        id: "nd_pay",
        actionKind: "capped_payment",
        label: "Pay the approved invoice",
      },
    ],
    branching: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function setWorkspace(agent = buildAgent()) {
  const harness = buildHarness({ agent });
  const workspace: Workspace = {
    store: harness.store,
    authority: harness.service,
    proofAnchor: harness.anchor,
    organizationId: ORG_ID,
    organizationName: "Test organization",
    bootstrapApiKeys: [],
    demoMode: true,
  };

  vi.mocked(getWorkspace).mockReturnValue(workspace);

  return harness.store;
}

describe("saveBlueprintAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not publish or store a blueprint assigned to a nonexistent agent", async () => {
    const store = setWorkspace();

    const result = await saveBlueprintAction(
      blueprint({ agentId: "agt_missing" }),
      true,
    );

    expect(result.error).toBe(
      "This flow still has blocking issues, so it was not published.",
    );
    expect(await store.listBlueprints()).toEqual([]);
  });

  it("does not publish or store a blueprint assigned to a paused agent", async () => {
    const store = setWorkspace(buildAgent({ status: "paused" }));

    const result = await saveBlueprintAction(blueprint(), true);

    expect(result.error).toBe(
      "This flow still has blocking issues, so it was not published.",
    );
    expect(await store.listBlueprints()).toEqual([]);
  });

  it("rejects a foreign organization id without mutating the store", async () => {
    const store = setWorkspace();

    const result = await saveBlueprintAction(
      blueprint({ organizationId: "org_foreign" }),
      false,
    );

    expect(result.error).toBe("This flow does not belong to the active workspace.");
    expect(await store.listBlueprints()).toEqual([]);
  });

  it("preserves a draft assigned to an agent that is not yet registered", async () => {
    const store = setWorkspace();

    const result = await saveBlueprintAction(
      blueprint({ agentId: "agt_pending" }),
      false,
    );

    expect(result).toEqual({ message: "Draft saved." });
    expect(await store.listBlueprints()).toEqual([
      expect.objectContaining({
        agentId: "agt_pending",
        organizationId: ORG_ID,
        status: "draft",
      }),
    ]);
  });
});
