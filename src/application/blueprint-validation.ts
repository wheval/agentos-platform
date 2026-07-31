import type {
  AgentBlueprint,
  BlueprintBranch,
  BlueprintStep,
} from "@/domain/blueprint";
import type { ActionKind, Agent, Policy } from "@/domain/schemas";

/**
 * Blueprint validation.
 *
 * The rule this module exists for: an action must be downstream of a policy
 * gate. A flow that reaches a payment without passing a gate describes an agent
 * spending without a bound, and the console refuses to publish it. Everything
 * else here is supporting work to make that rule trustworthy — a gate pointing
 * at a policy that no longer exists, or at one that has been retired, is a gate
 * that looks like governance without being it.
 *
 * Issues are returned rather than thrown, and each names the node it came from,
 * so the builder can mark the offending card instead of showing one banner and
 * leaving the operator to find it.
 */

export type BlueprintIssueCode =
  | "ACTION_NOT_GOVERNED"
  | "GATE_POLICY_UNKNOWN"
  | "GATE_POLICY_INACTIVE"
  | "GATE_WITHOUT_ACTION"
  | "BRANCH_OUTCOME_DUPLICATED"
  | "AGENT_MISSING_PERMISSION"
  | "AGENT_PAUSED"
  | "AGENT_UNKNOWN"
  | "AGENT_UNASSIGNED"
  | "NO_ACTION";

export type BlueprintIssue = {
  code: BlueprintIssueCode;
  /** Blocking issues prevent publishing. Warnings do not. */
  severity: "blocking" | "warning";
  message: string;
  /** Node the issue belongs to, when it is about a specific card. */
  nodeId?: string;
};

export type BlueprintValidation = {
  issues: BlueprintIssue[];
  /** True when nothing blocking remains. Warnings may still be present. */
  publishable: boolean;
};

export type ValidateBlueprintInput = {
  blueprint: AgentBlueprint;
  policies: Policy[];
  agents: Agent[];
};

/** The gates a path has passed through, in order. */
type GateContext = {
  policyIds: string[];
};

function isGoverned(context: GateContext): boolean {
  return context.policyIds.length > 0;
}

/**
 * Walks one linear run of steps, threading the gates seen so far.
 *
 * Returns the context at the end so a branch can inherit the gates the spine
 * already passed: a gate before the split governs every branch below it, which
 * is the shape most flows take.
 */
function walk(
  steps: BlueprintStep[],
  inherited: GateContext,
  policiesById: Map<string, Policy>,
  issues: BlueprintIssue[],
  location: string,
): { context: GateContext; actionCount: number; gatesUsed: Set<string> } {
  const context: GateContext = { policyIds: [...inherited.policyIds] };
  const gatesUsed = new Set<string>();
  let actionCount = 0;

  for (const step of steps) {
    if (step.kind === "policy_gate") {
      const policy = policiesById.get(step.policyId);

      if (!policy) {
        issues.push({
          code: "GATE_POLICY_UNKNOWN",
          severity: "blocking",
          message: `This gate points at ${step.policyId}, which does not exist.`,
          nodeId: step.id,
        });
        continue;
      }

      if (policy.status !== "active") {
        issues.push({
          code: "GATE_POLICY_INACTIVE",
          severity: "blocking",
          message: `${policy.name} is ${policy.status}. A gate can only bind an active policy.`,
          nodeId: step.id,
        });
        continue;
      }

      context.policyIds.push(step.policyId);
      continue;
    }

    if (step.kind !== "action") continue;

    actionCount += 1;

    if (!isGoverned(context)) {
      issues.push({
        code: "ACTION_NOT_GOVERNED",
        severity: "blocking",
        message: `“${step.label}” can act before any policy gate${location}. Add a gate above it so the authority is bounded.`,
        nodeId: step.id,
      });
      continue;
    }

    // The nearest gate is the one that bounds this action, matching how an
    // operator reads the flow downwards.
    const governingId = context.policyIds[context.policyIds.length - 1];
    if (governingId === undefined) continue;

    // A gate whose policy governs a different action kind than the action
    // below it would be governance in name only. There is only one action kind
    // today, so that check cannot fire and is deliberately absent rather than
    // shipped untested; it belongs here the moment a second kind lands.
    gatesUsed.add(governingId);
  }

  return { context, actionCount, gatesUsed };
}

function branchLocation(branch: BlueprintBranch): string {
  return ` on the “${branch.label}” path`;
}

export function validateBlueprint(
  input: ValidateBlueprintInput,
): BlueprintValidation {
  const { blueprint } = input;
  const issues: BlueprintIssue[] = [];
  const policiesById = new Map(
    input.policies.map((policy) => [policy.id, policy]),
  );

  const spine = walk(blueprint.steps, { policyIds: [] }, policiesById, issues, "");

  let actionCount = spine.actionCount;
  const gatesUsed = new Set(spine.gatesUsed);

  if (blueprint.branching) {
    const seenOutcomes = new Set<string>();

    for (const branch of blueprint.branching.branches) {
      if (seenOutcomes.has(branch.outcome)) {
        issues.push({
          code: "BRANCH_OUTCOME_DUPLICATED",
          severity: "blocking",
          message: `Two branches both handle ${branch.outcome}. Each outcome needs exactly one path or the flow is ambiguous.`,
          nodeId: blueprint.branching.id,
        });
      }

      seenOutcomes.add(branch.outcome);

      const walked = walk(
        branch.steps,
        spine.context,
        policiesById,
        issues,
        branchLocation(branch),
      );

      actionCount += walked.actionCount;
      for (const gate of walked.gatesUsed) gatesUsed.add(gate);
    }
  }

  // A gate nothing flows through is a control that looks present and does
  // nothing. Not blocking — it is usually a half-finished flow, not a wrong
  // one — but the operator should see it before publishing.
  for (const step of blueprint.steps) {
    if (step.kind === "policy_gate" && !gatesUsed.has(step.policyId)) {
      const policy = policiesById.get(step.policyId);

      if (!policy) continue;

      issues.push({
        code: "GATE_WITHOUT_ACTION",
        severity: "warning",
        message: `Nothing downstream of the ${policy.name} gate takes an action, so it bounds nothing.`,
        nodeId: step.id,
      });
    }
  }

  if (actionCount === 0) {
    issues.push({
      code: "NO_ACTION",
      severity: "warning",
      message: "This flow never requests authority. It can be saved, but it will not do anything.",
    });
  }

  if (!blueprint.agentId) {
    issues.push({
      code: "AGENT_UNASSIGNED",
      severity: "blocking",
      message: "Assign an agent before publishing. A flow with no agent has nobody accountable for it.",
    });
  } else {
    const agent = input.agents.find(
      (candidate) => candidate.id === blueprint.agentId,
    );

    if (!agent) {
      issues.push({
        code: "AGENT_UNKNOWN",
        severity: "blocking",
        message: `The assigned agent ${blueprint.agentId} no longer exists. Assign a live agent before publishing.`,
      });
    } else {
      if (agent.status === "paused") {
        issues.push({
          code: "AGENT_PAUSED",
          severity: "blocking",
          message: `${agent.name} is paused and cannot run a published flow.`,
        });
      }

      const required = new Set(collectActionKinds(blueprint));

      for (const kind of required) {
        if (agent.permissions.includes(kind)) continue;

        issues.push({
          code: "AGENT_MISSING_PERMISSION",
          severity: "blocking",
          message: `${agent.name} does not hold the ${kind} permission, so it cannot run this flow.`,
        });
      }
    }
  }

  return {
    issues,
    publishable: issues.every((issue) => issue.severity !== "blocking"),
  };
}

function collectActionKinds(blueprint: AgentBlueprint): ActionKind[] {
  const kinds: ActionKind[] = [];
  const visit = (steps: BlueprintStep[]) => {
    for (const step of steps) {
      if (step.kind === "action") kinds.push(step.actionKind);
    }
  };

  visit(blueprint.steps);

  for (const branch of blueprint.branching?.branches ?? []) visit(branch.steps);

  return kinds;
}
