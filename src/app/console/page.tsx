import Link from "next/link";
import { Badge, Card, CardHeader, DemoNotice, EmptyState, Stat } from "@/components/ui";
import {
  formatMoney,
  formatRelative,
  humanize,
  outcomeTone,
  requestTone,
} from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ConsoleOverview() {
  const { store, proofAnchor } = getWorkspace();

  const [requests, capabilities, agents, events, receipts] = await Promise.all([
    store.listActionRequests(),
    store.listCapabilities(),
    store.listAgents(),
    store.listAuditEvents(),
    store.listReceipts(),
  ]);

  const now = new Date();
  const awaitingApproval = requests.filter((r) => r.state === "pending_approval");
  const liveGrants = capabilities.filter(
    (c) => c.status === "active" && new Date(c.expiresAt) > now,
  );
  const settledMinor = receipts
    .filter((r) => r.status === "succeeded")
    .reduce((total, receipt) => total + receipt.amountMinor, 0);

  const recentRequests = [...requests]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const recentEvents = [...events]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Overview
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          Authority granted, exercised and withdrawn across the fleet.
        </p>
      </div>

      <DemoNotice>
        Demo workspace. Agents, policies and counterparties are fabricated, and
        the sandbox connector settles nothing — no real money moves. State is
        held in the server process and resets when it restarts.
      </DemoNotice>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Awaiting approval"
          value={String(awaitingApproval.length)}
          hint={awaitingApproval.length === 1 ? "1 request" : "requests"}
        />
        <Stat
          label="Live capabilities"
          value={String(liveGrants.length)}
          hint="Active and unexpired"
        />
        <Stat
          label="Active agents"
          value={String(agents.filter((a) => a.status === "active").length)}
          hint={`${agents.length} registered`}
        />
        <Stat
          label="Sandbox settled"
          value={formatMoney(settledMinor, "USD")}
          hint="No real funds"
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="Recent requests"
            description="What agents asked for and what policy decided."
            action={
              <Link
                href="/console/requests"
                className="rounded-md px-2 py-1 text-sm font-medium text-[#2f6b55] hover:bg-[#eef1ee]"
              >
                View all
              </Link>
            }
          />

          {recentRequests.length === 0 ? (
            <EmptyState>No requests yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-[#eef1ee]">
              {recentRequests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/console/requests/${request.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-[#f7f9f7]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#14231f]">
                        {formatMoney(request.input.amountMinor, request.input.currency)}{" "}
                        to {request.input.counterpartyName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[#66736e]">
                        {request.agentId} · {formatRelative(request.createdAt, now)}
                      </span>
                    </span>
                    <Badge tone={requestTone(request.state)}>
                      {humanize(request.state)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Proof anchoring"
              description="Where decision commitments are published."
            />
            <div className="space-y-2 px-5 py-4 text-sm">
              <p className="flex items-center justify-between gap-3">
                <span className="text-[#66736e]">Network</span>
                <Badge tone={proofAnchor.network === "local" ? "caution" : "positive"}>
                  {proofAnchor.network}
                </Badge>
              </p>
              <p className="text-[#48544f]">{proofAnchor.description}</p>
              <Link
                href="/console/proofs"
                className="inline-flex text-sm font-medium text-[#2f6b55] hover:underline"
              >
                Inspect the anchor log
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Latest activity"
              action={
                <Link
                  href="/console/audit"
                  className="rounded-md px-2 py-1 text-sm font-medium text-[#2f6b55] hover:bg-[#eef1ee]"
                >
                  Full ledger
                </Link>
              }
            />
            {recentEvents.length === 0 ? (
              <EmptyState>Nothing recorded yet.</EmptyState>
            ) : (
              <ul className="divide-y divide-[#eef1ee]">
                {recentEvents.map((event) => (
                  <li key={event.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm text-[#14231f]">
                        {event.summary}
                      </p>
                      <Badge
                        tone={outcomeTone(
                          event.outcome === "failed" ? "denied" : event.outcome,
                        )}
                      >
                        {event.outcome}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#66736e]">
                      {event.actor.displayName} ·{" "}
                      {formatRelative(event.occurredAt, now)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
