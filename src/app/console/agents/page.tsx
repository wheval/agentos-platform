import {
  createAgentDraftAction,
  type CreateAgentDraftState,
} from "@/app/console/actions";
import { AgentDirectory } from "@/components/agent-directory";
import { effectiveCapabilityStatus } from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "All agents" };

type DraftInput = Parameters<typeof createAgentDraftAction>[0];

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { store } = getWorkspace();
  const [agents, requests, capabilities, blueprints, params] = await Promise.all([
    store.listAgents(),
    store.listActionRequests(),
    store.listCapabilities(),
    store.listBlueprints(),
    searchParams,
  ]);

  const requestCount = new Map<string, number>();
  const liveCapabilityCount = new Map<string, number>();
  const now = new Date();

  for (const request of requests) {
    requestCount.set(request.agentId, (requestCount.get(request.agentId) ?? 0) + 1);
  }

  for (const capability of capabilities) {
    if (effectiveCapabilityStatus(capability, now) !== "active") continue;
    liveCapabilityCount.set(
      capability.issuedToAgentId,
      (liveCapabilityCount.get(capability.issuedToAgentId) ?? 0) + 1,
    );
  }

  const managers = [
    ...new Map(
      agents.map((agent) => [
        agent.managerId,
        { id: agent.managerId, name: agent.managerName },
      ]),
    ).values(),
  ];

  async function create(input: DraftInput): Promise<CreateAgentDraftState> {
    "use server";
    return createAgentDraftAction(input);
  }

  return (
    <AgentDirectory
      key={params.new === "1" ? "dialog-open" : "dialog-closed"}
      initialDialogOpen={params.new === "1"}
      managers={managers}
      createAction={create}
      agents={agents.map((agent) => {
        const blueprint = blueprints.find(
          (candidate) => candidate.agentId === agent.id,
        );

        return {
          ...agent,
          requestCount: requestCount.get(agent.id) ?? 0,
          liveCapabilityCount: liveCapabilityCount.get(agent.id) ?? 0,
          blueprintId: blueprint?.id ?? null,
          blueprintStatus: blueprint?.status ?? null,
        };
      })}
    />
  );
}
