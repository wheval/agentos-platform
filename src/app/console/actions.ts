"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { validateBlueprint } from "@/application/blueprint-validation";
import { AgentBlueprintSchema } from "@/domain/blueprint";
import { AgentSchema, type Actor } from "@/domain/schemas";
import { readOperatorSession } from "@/lib/operator-session";
import { getWorkspace } from "@/lib/workspace";

/**
 * Operator mutations.
 *
 * Every action re-checks the session rather than trusting the layout: a server
 * action is a public endpoint, and the fact that it is only rendered behind a
 * guard is not itself a guard.
 *
 * Approver identity comes from the form because this milestone has no
 * per-operator accounts. That is a real limitation, stated here so it is not
 * mistaken for attribution.
 */

export type ActionState = { error?: string; message?: string };

export type CreateAgentDraftState = ActionState & {
  agentId?: string;
  blueprintId?: string;
};

const NewAgentDraftSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    jobDescription: z.string().trim().min(10).max(400),
    managerId: z.string().regex(/^usr_[a-z0-9][a-z0-9_-]*$/),
    riskTier: z.enum(["low", "medium", "high"]),
    permission: z.enum(["none", "capped_payment"]),
    template: z.enum(["blank", "bounded_payment", "review_only"]),
  })
  .strict();

async function requireOperator(): Promise<void> {
  const session = await readOperatorSession();

  if (!session.authenticated) throw new Error("Operator session required");
}

function operatorActor(id: string, displayName: string): Actor {
  return { type: "human", id, displayName };
}

function refresh(): void {
  revalidatePath("/console", "layout");
}

export async function approveRequestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOperator();

  const actionRequestId = String(formData.get("actionRequestId") ?? "");
  const [approverId = "", approverName = ""] = String(
    formData.get("approver") ?? "",
  ).split("|");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Choose approve or reject." };
  }

  if (!approverId || !approverName) return { error: "Select an approver." };

  const { authority } = getWorkspace();
  const result = await authority.recordApproval({
    actionRequestId,
    approverId,
    approverName,
    decision,
    ...(reason ? { reason } : {}),
  });

  if (!result.ok) return { error: result.error.message };

  refresh();

  return {
    message:
      result.value.request.state === "approved"
        ? "Approved. A capability can now be issued."
        : `Decision recorded. Request is ${result.value.request.state.replace(/_/g, " ")}.`,
  };
}

export async function issueCapabilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOperator();

  const actionRequestId = String(formData.get("actionRequestId") ?? "");

  const { authority } = getWorkspace();
  const result = await authority.issueCapability({
    actionRequestId,
    actor: operatorActor("usr_console", "Console operator"),
  });

  if (!result.ok) return { error: result.error.message };

  refresh();

  return {
    message: `Issued ${result.value.capability.id}, expiring ${result.value.capability.expiresAt}.`,
  };
}

export async function executeCapabilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOperator();

  const capabilityId = String(formData.get("capabilityId") ?? "");
  const agentId = String(formData.get("agentId") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "").trim();

  if (idempotencyKey.length < 8) {
    return { error: "Idempotency key must be at least 8 characters." };
  }

  const { authority } = getWorkspace();
  const result = await authority.executeCapability({
    capabilityId,
    agentId,
    idempotencyKey,
    actor: operatorActor("usr_console", "Console operator"),
  });

  if (!result.ok) return { error: result.error.message };

  refresh();

  return {
    message:
      result.value.receipt.status === "succeeded"
        ? `Sandbox settlement recorded as ${result.value.receipt.providerReference ?? result.value.receipt.id}.`
        : `Execution failed: ${result.value.receipt.failureReason ?? "unknown reason"}.`,
  };
}

export async function revokeCapabilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOperator();

  const capabilityId = String(formData.get("capabilityId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const { authority } = getWorkspace();
  const result = await authority.revokeCapability({
    capabilityId,
    reason: reason.length > 0 ? reason : "Revoked from the operator console",
    actor: operatorActor("usr_console", "Console operator"),
  });

  if (!result.ok) return { error: result.error.message };

  refresh();

  return { message: "Authority withdrawn. The grant can no longer be redeemed." };
}

/**
 * Saves a blueprint.
 *
 * The browser validates on every keystroke for feedback; this re-runs the same
 * rules against live policy and agent state before anything is stored. A client
 * that skips the UI, or an operator whose policy was retired mid-edit, gets the
 * same refusal.
 */
export async function saveBlueprintAction(
  input: unknown,
  publish: boolean,
): Promise<ActionState> {
  await requireOperator();

  const parsed = AgentBlueprintSchema.safeParse(input);

  if (!parsed.success) {
    return { error: "That flow is not a shape we can store." };
  }

  const { store, organizationId } = getWorkspace();

  if (parsed.data.organizationId !== organizationId) {
    return { error: "This flow does not belong to the active workspace." };
  }

  const [policies, agents] = await Promise.all([
    store.listPolicies(),
    store.listAgents(),
  ]);

  const validation = validateBlueprint({
    blueprint: parsed.data,
    policies,
    agents,
  });

  if (publish && !validation.publishable) {
    return { error: "This flow still has blocking issues, so it was not published." };
  }

  await store.upsertBlueprint({
    ...parsed.data,
    organizationId,
    status: publish ? "published" : "draft",
    updatedAt: new Date().toISOString(),
  });

  refresh();

  return { message: publish ? "Published." : "Draft saved." };
}

/**
 * Creates an in-memory draft configuration, never an active agent.
 *
 * New records start paused and their blueprint starts as a draft. Templates
 * only compose supported blueprint fields; they do not issue authority, connect
 * an account or execute work. The existing publish action remains the only path
 * that can mark the blueprint published, and re-runs fail-closed validation.
 */
export async function createAgentDraftAction(
  input: unknown,
): Promise<CreateAgentDraftState> {
  await requireOperator();

  const parsed = NewAgentDraftSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error:
        "Add a name, a clear job description, an accountability owner and an explicit authority choice.",
    };
  }

  const { store, organizationId } = getWorkspace();
  const [policies, agents] = await Promise.all([
    store.listPolicies(),
    store.listAgents(),
  ]);
  const manager = agents.find(
    (candidate) => candidate.managerId === parsed.data.managerId,
  );

  if (!manager) {
    return {
      error: "Choose an accountability owner from the active workspace.",
    };
  }

  const now = new Date().toISOString();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const agentId = `agt_${suffix}`;
  const blueprintId = `bp_${suffix}`;
  const permission =
    parsed.data.permission === "capped_payment" ? ["capped_payment" as const] : [];

  const activePaymentPolicy = policies.find(
    (policy) => policy.status === "active" && policy.actionKind === "capped_payment",
  );

  if (parsed.data.template === "bounded_payment" && !activePaymentPolicy) {
    return {
      error: "The bounded-action template needs an active payment policy.",
    };
  }

  const agent = AgentSchema.parse({
    id: agentId,
    name: parsed.data.name,
    jobDescription: parsed.data.jobDescription,
    managerId: manager.managerId,
    managerName: manager.managerName,
    status: "paused",
    riskTier: parsed.data.riskTier,
    permissions: permission,
    lastActiveAt: now,
  });

  const steps =
    parsed.data.template === "bounded_payment" && activePaymentPolicy
      ? [
          {
            kind: "policy_gate" as const,
            id: "nd_policy_gate",
            policyId: activePaymentPolicy.id,
          },
          {
            kind: "action" as const,
            id: "nd_bounded_action",
            actionKind: "capped_payment" as const,
            label: "Request a bounded payment",
          },
          {
            kind: "notify" as const,
            id: "nd_notify_manager",
            audience: "manager" as const,
            label: "Notify the accountable manager",
          },
        ]
      : parsed.data.template === "review_only"
        ? [
            {
              kind: "step" as const,
              id: "nd_prepare_review",
              label: "Prepare work for human review",
              detail: "Produces a proposal but requests no execution authority.",
            },
            {
              kind: "notify" as const,
              id: "nd_send_review",
              audience: "manager" as const,
              label: "Send the proposal to the manager",
            },
          ]
        : [];

  const blueprint = AgentBlueprintSchema.parse({
    id: blueprintId,
    organizationId,
    name: `${agent.name} control flow`,
    summary: agent.jobDescription,
    agentId: agent.id,
    status: "draft",
    trigger: {
      kind: "manual",
      label: "An operator starts this draft",
    },
    steps,
    branching: null,
    createdAt: now,
    updatedAt: now,
  });

  await store.upsertAgent(agent);
  await store.upsertBlueprint(blueprint);
  refresh();

  return {
    message: "Draft configuration created. The agent remains paused.",
    agentId,
    blueprintId,
  };
}
