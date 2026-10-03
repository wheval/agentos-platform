import {
  ActivityWorkspace,
  type ActivityRow,
  type NeedsActionRow,
} from "@/components/activity-workspace";
import {
  effectiveCapabilityStatus,
  formatMoney,
  formatRelative,
  humanize,
} from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "All activity" };

export default async function ActivityPage() {
  const { store } = getWorkspace();
  const [agents, requests, approvals, capabilities, events] = await Promise.all([
    store.listAgents(),
    store.listActionRequests(),
    store.listApprovals(),
    store.listCapabilities(),
    store.listAuditEvents(),
  ]);
  const now = new Date();
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const capabilityByRequest = new Map(
    capabilities.map((capability) => [capability.actionRequestId, capability]),
  );
  const approvalCount = new Map<string, number>();

  for (const approval of approvals) {
    if (approval.decision !== "approved") continue;
    approvalCount.set(
      approval.actionRequestId,
      (approvalCount.get(approval.actionRequestId) ?? 0) + 1,
    );
  }

  const needsAction: NeedsActionRow[] = requests
    .filter((request) => request.state === "pending_approval")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((request) => {
      const agent = agentById.get(request.agentId);
      const approved = approvalCount.get(request.id) ?? 0;
      const required = request.policyEvaluation?.requiredApprovals ?? 0;

      return {
        id: request.id,
        agentId: request.agentId,
        agentName: agent?.name ?? request.agentId,
        title: `${formatMoney(request.input.amountMinor, request.input.currency)} to ${request.input.counterpartyName}`,
        description: request.input.context,
        relativeTime: formatRelative(request.updatedAt, now),
        approvalProgress: `${approved} of ${required} approvals`,
        riskLabel: `${agent?.riskTier ?? "unknown"} risk`,
      };
    });

  const activity: ActivityRow[] = [...events]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((event) => {
      const request = event.actionRequestId
        ? requestById.get(event.actionRequestId)
        : undefined;
      const agentId =
        event.actor.type === "agent" ? event.actor.id : (request?.agentId ?? null);
      const capability = event.actionRequestId
        ? capabilityByRequest.get(event.actionRequestId)
        : undefined;

      return {
        id: event.id,
        agentId,
        agentName: agentId
          ? (agentById.get(agentId)?.name ?? agentId)
          : event.actor.displayName,
        summary: event.summary,
        eventType: humanize(event.eventType),
        outcome: event.outcome,
        relativeTime: formatRelative(event.occurredAt, now),
        requestId: event.actionRequestId ?? null,
        capabilityStatus: capability
          ? effectiveCapabilityStatus(capability, now)
          : null,
      };
    });

  return (
    <ActivityWorkspace
      agents={agents.map(({ id, name }) => ({ id, name }))}
      needsAction={needsAction}
      activity={activity}
    />
  );
}
