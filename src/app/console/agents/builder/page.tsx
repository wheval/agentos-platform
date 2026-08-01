import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BlueprintBuilder,
  type BuilderActivity,
} from "@/components/blueprint-builder";
import { formatRelative } from "@/components/format";
import { saveBlueprintAction } from "@/app/console/actions";
import { AgentBlueprintSchema, type AgentBlueprint } from "@/domain/blueprint";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent builder" };

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ blueprint?: string; agent?: string }>;
}) {
  const { store } = getWorkspace();
  const [blueprints, policies, agents, requests, events] = await Promise.all([
    store.listBlueprints(),
    store.listPolicies(),
    store.listAgents(),
    store.listActionRequests(),
    store.listAuditEvents(),
  ]);

  const params = await searchParams;
  const selectedAgent = params.agent
    ? agents.find((candidate) => candidate.id === params.agent)
    : undefined;
  const storedBlueprint = params.blueprint
    ? blueprints.find((candidate) => candidate.id === params.blueprint)
    : selectedAgent
      ? blueprints.find((candidate) => candidate.agentId === selectedAgent.id)
      : blueprints[0];

  if (params.agent && !selectedAgent) notFound();

  const now = new Date().toISOString();
  const blueprint =
    storedBlueprint ??
    (selectedAgent
      ? AgentBlueprintSchema.parse({
          id: `bp_${selectedAgent.id.slice(4)}_draft`,
          organizationId: getWorkspace().organizationId,
          name: `${selectedAgent.name} control flow`,
          summary: selectedAgent.jobDescription,
          agentId: selectedAgent.id,
          status: "draft",
          trigger: { kind: "manual", label: "An operator starts this draft" },
          steps: [],
          branching: null,
          createdAt: now,
          updatedAt: now,
        })
      : null);

  if (!blueprint) notFound();

  const assignedAgent = agents.find((agent) => agent.id === blueprint.agentId);
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const activity: BuilderActivity[] = events
    .filter((event) => {
      if (event.actor.type === "agent" && event.actor.id === blueprint.agentId) {
        return true;
      }

      return event.actionRequestId
        ? requestById.get(event.actionRequestId)?.agentId === blueprint.agentId
        : false;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .map((event) => ({
      id: event.id,
      summary: event.summary,
      eventType: event.eventType,
      outcome: event.outcome,
      relativeTime: formatRelative(event.occurredAt, new Date()),
      requestId: event.actionRequestId ?? null,
    }));

  async function save(next: AgentBlueprint, publish: boolean) {
    "use server";

    return saveBlueprintAction(next, publish);
  }

  return (
    <div className="min-h-screen bg-[#f3f5f1]">
      <header className="flex flex-col gap-4 border-b border-[#e0e5df] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#153d31] text-xs font-bold text-[#d8f1e5]"
          >
            {(assignedAgent?.name ?? blueprint.name)
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-[-0.025em] text-[#14231f]">
                {assignedAgent?.name ?? blueprint.name}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
                  assignedAgent?.status === "active"
                    ? "bg-[#e3f1e9] text-[#286148]"
                    : "bg-[#f8edda] text-[#805b20]"
                }`}
              >
                {assignedAgent?.status ?? "unassigned"}
              </span>
            </div>
            <p className="mt-1 max-w-3xl truncate text-sm text-[#66736e]">
              {assignedAgent?.jobDescription ?? blueprint.summary}
            </p>
          </div>
        </div>
        <Link
          href="/console/agents"
          className="rounded-xl border border-[#d7ded8] px-3.5 py-2 text-center text-sm font-medium text-[#45524c] transition-[border-color,background-color,transform] hover:border-[#b7c6bc] hover:bg-[#f8faf8] active:scale-[0.98]"
        >
          All agents
        </Link>
      </header>

      <div className="p-4 sm:p-6 lg:p-8">
        <BlueprintBuilder
          initialBlueprint={blueprint}
          policies={policies}
          agents={agents}
          activity={activity}
          saveAction={save}
        />
      </div>
    </div>
  );
}
