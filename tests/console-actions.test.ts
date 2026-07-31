import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBlueprintSchema, type AgentBlueprint } from "@/domain/blueprint";
import { buildAgent, buildPolicy, NOW, ORG_ID } from "./fixtures";

const mocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  readOperatorSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  getWorkspace: mocks.getWorkspace,
}));

vi.mock("@/lib/operator-session", () => ({
  readOperatorSession: mocks.readOperatorSession,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { saveBlueprintAction } from "@/app/console/actions";

const gate = {
  kind: "policy_gate" as const,
  id: "nd_gate",
  policyId: "pol_vendor_payment",
};
const pay = {
  kind: "action" as const,
  id: "nd_pay",
  actionKind: "capped_payment" as const,
  label: "Pay the invoice",
};

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return AgentBlueprintSchema.parse({
    id: "bp_action_test",
    organizationId: ORG_ID,
    name: "Action test flow",
    summary: "A valid governed flow used to test the public save boundary.",
    agentId: "agt_finance",
    status: "draft",
    trigger: { kind: "manual", label: "Operator starts the flow" },
    steps: [gate, pay],
    branching: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function arrange(agents = [buildAgent()]) {
  const store = {
    listPolicies: vi.fn().mockResolvedValue([buildPolicy()]),
    listAgents: vi.fn().mockResolvedValue(agents),
    upsertBlueprint: vi.fn(),
  };

  mocks.getWorkspace.mockReturnValue({
    organizationId: ORG_ID,
    store,
  });

  return store;
}

describe("saveBlueprintAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readOperatorSession.mockResolvedValue({
      authenticated: true,
      mode: "demo",
      issuedAt: 0,
    });
  });

  it("does not publish or store a flow assigned to a nonexistent agent", async () => {
    const store = arrange([]);

    const result = await saveBlueprintAction(
      blueprint({ agentId: "agt_missing" }),
      true,
    );

    expect(result.error).toMatch(/blocking issues/);
    expect(store.upsertBlueprint).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not publish or store a flow assigned to a paused agent", async () => {
    const store = arrange([buildAgent({ status: "paused" })]);

    const result = await saveBlueprintAction(blueprint(), true);

    expect(result.error).toMatch(/blocking issues/);
    expect(store.upsertBlueprint).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "rejects an organization mismatch before any store access when publish is %s",
    async (publish) => {
      const store = arrange();

      const result = await saveBlueprintAction(
        blueprint({ organizationId: "org_other" }),
        publish,
      );

      expect(result.error).toMatch(/different organization/);
      expect(store.listPolicies).not.toHaveBeenCalled();
      expect(store.listAgents).not.toHaveBeenCalled();
      expect(store.upsertBlueprint).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("still saves a draft with an unresolved agent for later repair", async () => {
    const store = arrange([]);
    const draft = blueprint({ agentId: "agt_missing" });

    const result = await saveBlueprintAction(draft, false);

    expect(result).toEqual({ message: "Draft saved." });
    expect(store.upsertBlueprint).toHaveBeenCalledWith(
      expect.objectContaining({
        id: draft.id,
        agentId: "agt_missing",
        status: "draft",
      }),
    );
  });
});
