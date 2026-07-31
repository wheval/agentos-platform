"use server";

import { revalidatePath } from "next/cache";
import { validateBlueprint } from "@/application/blueprint-validation";
import { AgentBlueprintSchema } from "@/domain/blueprint";
import type { Actor } from "@/domain/schemas";
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
