import Link from "next/link";
import { Badge, Card, EmptyState, Mono } from "@/components/ui";
import {
  capabilityTone,
  formatMoney,
  formatRelative,
} from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Capabilities" };

export default async function CapabilitiesPage() {
  const { store } = getWorkspace();
  const [capabilities, agents] = await Promise.all([
    store.listCapabilities(),
    store.listAgents(),
  ]);

  const agentName = new Map(agents.map((agent) => [agent.id, agent.name]));
  const now = new Date();
  const ordered = [...capabilities].sort((a, b) =>
    b.issuedAt.localeCompare(a.issuedAt),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Capabilities
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          A grant carries scope, not credentials. Every field below is re-checked
          when the agent tries to redeem it, not only when it was issued.
        </p>
      </div>

      <Card>
        {ordered.length === 0 ? (
          <EmptyState>No capabilities have been issued.</EmptyState>
        ) : (
          <ul className="divide-y divide-[#eef1ee]">
            {ordered.map((capability) => {
              const expired = new Date(capability.expiresAt) <= now;
              const status =
                expired && capability.status === "active"
                  ? "expired"
                  : capability.status;

              return (
                <li key={capability.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <Link
                      href={`/console/requests/${capability.actionRequestId}`}
                      className="text-sm font-medium text-[#2f6b55] hover:underline"
                    >
                      {agentName.get(capability.issuedToAgentId) ??
                        capability.issuedToAgentId}
                    </Link>
                    <Badge tone={capabilityTone(status)}>{status}</Badge>
                  </div>

                  <p className="mt-1.5 text-sm text-[#48544f]">
                    Up to{" "}
                    {formatMoney(
                      capability.scope.amountLimitMinor,
                      capability.scope.currency,
                    )}{" "}
                    with <Mono>{capability.scope.counterpartyId}</Mono> on{" "}
                    <Mono>{capability.scope.resource}</Mono>
                  </p>

                  <p className="mt-2 text-xs text-[#66736e]">
                    <Mono>{capability.id}</Mono> · {capability.usesRemaining} of{" "}
                    {capability.maxUses} uses ·{" "}
                    {expired ? "expired" : "expires"}{" "}
                    {formatRelative(capability.expiresAt, now)}
                  </p>

                  {capability.revokedReason ? (
                    <p className="mt-1 text-xs text-[#8a2f28]">
                      Revoked: {capability.revokedReason}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
