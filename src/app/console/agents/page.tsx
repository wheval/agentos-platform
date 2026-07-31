import { Badge, Card, EmptyState } from "@/components/ui";
import { formatRelative, humanize, riskTone } from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const { store } = getWorkspace();
  const [agents, requests] = await Promise.all([
    store.listAgents(),
    store.listActionRequests(),
  ]);

  const now = new Date();
  const requestCount = new Map<string, number>();

  for (const request of requests) {
    requestCount.set(
      request.agentId,
      (requestCount.get(request.agentId) ?? 0) + 1,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Agents
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          Every agent has a job description, an accountable manager and an
          explicit permission set. An agent with no permissions cannot request
          authority at all.
        </p>
      </div>

      <Card>
        {agents.length === 0 ? (
          <EmptyState>No agents registered.</EmptyState>
        ) : (
          <ul className="divide-y divide-[#eef1ee]">
            {agents.map((agent) => (
              <li key={agent.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h2 className="text-sm font-semibold text-[#14231f]">
                    {agent.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={riskTone(agent.riskTier)}>
                      {agent.riskTier} risk
                    </Badge>
                    <Badge tone={agent.status === "active" ? "positive" : "critical"}>
                      {agent.status}
                    </Badge>
                  </div>
                </div>

                <p className="mt-1.5 text-sm text-[#48544f]">
                  {agent.jobDescription}
                </p>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#66736e]">
                  <div className="flex gap-1.5">
                    <dt>Manager</dt>
                    <dd className="text-[#33413c]">{agent.managerName}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Permissions</dt>
                    <dd className="text-[#33413c]">
                      {agent.permissions.length === 0
                        ? "None"
                        : agent.permissions.map(humanize).join(", ")}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Requests</dt>
                    <dd className="text-[#33413c]">
                      {requestCount.get(agent.id) ?? 0}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Last active</dt>
                    <dd className="text-[#33413c]">
                      {formatRelative(agent.lastActiveAt, now)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
