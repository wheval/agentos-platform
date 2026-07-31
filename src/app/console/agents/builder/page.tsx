import Link from "next/link";
import { notFound } from "next/navigation";
import { BlueprintBuilder } from "@/components/blueprint-builder";
import { DemoNotice } from "@/components/ui";
import { saveBlueprintAction } from "@/app/console/actions";
import type { AgentBlueprint } from "@/domain/blueprint";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Agent builder" };

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ blueprint?: string }>;
}) {
  const { store } = getWorkspace();
  const [blueprints, policies, agents] = await Promise.all([
    store.listBlueprints(),
    store.listPolicies(),
    store.listAgents(),
  ]);

  const params = await searchParams;
  const blueprint = params.blueprint
    ? blueprints.find((candidate) => candidate.id === params.blueprint)
    : blueprints[0];

  if (!blueprint) notFound();

  async function save(next: AgentBlueprint, publish: boolean) {
    "use server";

    return saveBlueprintAction(next, publish);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
            {blueprint.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#48544f]">{blueprint.summary}</p>
        </div>
        <Link
          href="/console/agents"
          className="rounded-lg border border-[#dde2dc] px-3 py-2 text-sm font-medium text-[#14231f] transition hover:border-[#2f6b55]"
        >
          Back to agents
        </Link>
      </div>

      <DemoNotice>
        Demo data. Editing a blueprint changes what the console shows, not what an
        agent may do — authority is still issued per request against the live
        policy.
      </DemoNotice>

      <BlueprintBuilder
        initialBlueprint={blueprint}
        policies={policies}
        agents={agents}
        saveAction={save}
      />
    </div>
  );
}
