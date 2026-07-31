import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import {
  formatMoney,
  formatRelative,
  humanize,
  requestTone,
} from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Requests" };

export default async function RequestsPage() {
  const { store } = getWorkspace();
  const [requests, agents] = await Promise.all([
    store.listActionRequests(),
    store.listAgents(),
  ]);

  const agentName = new Map(agents.map((agent) => [agent.id, agent.name]));
  const now = new Date();
  const ordered = [...requests].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const pending = ordered.filter((r) => r.state === "pending_approval");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Action requests
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          {pending.length > 0
            ? `${pending.length} awaiting a human decision.`
            : "Nothing is waiting on a human right now."}
        </p>
      </div>

      <Card>
        {ordered.length === 0 ? (
          <EmptyState>No requests have been submitted.</EmptyState>
        ) : (
          <ul className="divide-y divide-[#eef1ee]">
            {ordered.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/console/requests/${request.id}`}
                  className="block px-5 py-4 transition-colors hover:bg-[#f7f9f7]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <p className="text-sm font-medium text-[#14231f]">
                      {formatMoney(
                        request.input.amountMinor,
                        request.input.currency,
                      )}{" "}
                      to {request.input.counterpartyName}
                    </p>
                    <Badge tone={requestTone(request.state)}>
                      {humanize(request.state)}
                    </Badge>
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-sm text-[#48544f]">
                    {request.input.context}
                  </p>

                  <p className="mt-2 text-xs text-[#66736e]">
                    {agentName.get(request.agentId) ?? request.agentId} ·{" "}
                    {request.input.reference} ·{" "}
                    {formatRelative(request.createdAt, now)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
