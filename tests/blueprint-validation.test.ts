import { describe, expect, it } from "vitest";
import { validateBlueprint } from "@/application/blueprint-validation";
import { AgentBlueprintSchema, type AgentBlueprint } from "@/domain/blueprint";
import { AgentSchema, PolicySchema, type Agent, type Policy } from "@/domain/schemas";

/**
 * The rule under test is the one the builder exists for: an action that is not
 * downstream of a policy gate cannot be published. Everything else here guards
 * the ways a gate can be present but not actually governing.
 */

const NOW = "2026-07-31T12:00:00.000Z";

function policy(overrides: Partial<Policy> = {}): Policy {
  return PolicySchema.parse({
    id: "pol_vendor",
    name: "Vendor payments",
    description: "Caps vendor spend for the finance agent.",
    version: 1,
    actionKind: "capped_payment",
    status: "active",
    constraints: {
      currency: "USD",
      maxAmountMinor: 500_000,
      approvedCounterpartyIds: ["cpty_acme"],
      resource: "treasury:operating",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
      capabilityTtlSeconds: 300,
    },
    approvalRule: { threshold: 1, approverIds: ["usr_ops"] },
    ...overrides,
  });
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return AgentSchema.parse({
    id: "agt_finance",
    name: "Finance agent",
    jobDescription: "Pays approved vendor invoices.",
    managerId: "usr_ops",
    managerName: "Dana Okafor",
    status: "active",
    riskTier: "high",
    permissions: ["capped_payment"],
    lastActiveAt: NOW,
    ...overrides,
  });
}

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return AgentBlueprintSchema.parse({
    id: "bp_test",
    organizationId: "org_test",
    name: "Test flow",
    summary: "A flow used to exercise the validation rules.",
    agentId: "agt_finance",
    status: "draft",
    trigger: { kind: "schedule", label: "Every weekday at 09:00" },
    steps: [],
    branching: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

const gate = { kind: "policy_gate" as const, id: "nd_gate", policyId: "pol_vendor" };
const pay = {
  kind: "action" as const,
  id: "nd_pay",
  actionKind: "capped_payment" as const,
  label: "Pay the invoice",
};

function validate(bp: AgentBlueprint, policies = [policy()], agents = [agent()]) {
  return validateBlueprint({ blueprint: bp, policies, agents });
}

function codes(bp: AgentBlueprint, policies = [policy()], agents = [agent()]) {
  return validate(bp, policies, agents).issues.map((issue) => issue.code);
}

describe("blueprint validation", () => {
  it("publishes a flow where the action sits below a gate", () => {
    const result = validate(blueprint({ steps: [gate, pay] }));

    expect(result.issues).toEqual([]);
    expect(result.publishable).toBe(true);
  });

  it("refuses an action with no gate above it", () => {
    const result = validate(blueprint({ steps: [pay] }));

    expect(result.publishable).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "ACTION_NOT_GOVERNED", nodeId: "nd_pay" }),
    );
  });

  it("refuses an action placed above the gate that was meant to bound it", () => {
    // Order is the whole point: the same two nodes, reversed, is a different flow.
    expect(codes(blueprint({ steps: [pay, gate] }))).toContain("ACTION_NOT_GOVERNED");
  });

  it("refuses a gate bound to a policy that does not exist", () => {
    const result = validate(
      blueprint({ steps: [{ ...gate, policyId: "pol_missing" }, pay] }),
    );

    expect(result.publishable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "GATE_POLICY_UNKNOWN",
      // A gate that did not resolve governs nothing, so the action below it is
      // still ungoverned. Both issues are real and both are reported.
      "ACTION_NOT_GOVERNED",
    ]);
  });

  it("refuses a gate bound to a retired policy", () => {
    expect(codes(blueprint({ steps: [gate, pay] }), [policy({ status: "retired" })])).toContain(
      "GATE_POLICY_INACTIVE",
    );
  });

  it("lets a gate on the spine govern actions inside every branch", () => {
    const result = validate(
      blueprint({
        steps: [gate],
        branching: {
          id: "nd_split",
          label: "Policy decision",
          branches: [
            {
              id: "br_auto",
              outcome: "auto_approved",
              label: "Under the line",
              steps: [pay],
            },
            {
              id: "br_review",
              outcome: "requires_approval",
              label: "Over the line",
              steps: [{ ...pay, id: "nd_pay_two" }],
            },
          ],
        },
      }),
    );

    expect(result.issues).toEqual([]);
    expect(result.publishable).toBe(true);
  });

  it("refuses an ungoverned action inside a branch when the spine has no gate", () => {
    const result = validate(
      blueprint({
        steps: [],
        branching: {
          id: "nd_split",
          label: "Policy decision",
          branches: [
            { id: "br_auto", outcome: "auto_approved", label: "Under", steps: [pay] },
            { id: "br_review", outcome: "requires_approval", label: "Over", steps: [] },
          ],
        },
      }),
    );

    expect(result.publishable).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "ACTION_NOT_GOVERNED", nodeId: "nd_pay" }),
    );
  });

  it("refuses two branches that claim the same outcome", () => {
    expect(
      codes(
        blueprint({
          steps: [gate],
          branching: {
            id: "nd_split",
            label: "Policy decision",
            branches: [
              { id: "br_one", outcome: "auto_approved", label: "First", steps: [pay] },
              {
                id: "br_two",
                outcome: "auto_approved",
                label: "Second",
                steps: [{ ...pay, id: "nd_pay_two" }],
              },
            ],
          },
        }),
      ),
    ).toContain("BRANCH_OUTCOME_DUPLICATED");
  });

  it("refuses a flow assigned to an agent without the permission", () => {
    const unprivileged = agent({ permissions: [] });

    expect(codes(blueprint({ steps: [gate, pay] }), [policy()], [unprivileged])).toContain(
      "AGENT_MISSING_PERMISSION",
    );
  });

  it("refuses a flow with nobody accountable for it", () => {
    expect(codes(blueprint({ steps: [gate, pay], agentId: null }))).toContain(
      "AGENT_UNASSIGNED",
    );
  });

  it("warns, but still publishes, when a gate bounds nothing", () => {
    const result = validate(blueprint({ steps: [gate] }));

    expect(result.publishable).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "GATE_WITHOUT_ACTION",
      "NO_ACTION",
    ]);
  });
});
