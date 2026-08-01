"use client";

import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ActivityAgent = { id: string; name: string };

export type NeedsActionRow = {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  description: string;
  relativeTime: string;
  approvalProgress: string;
  riskLabel: string;
};

export type ActivityRow = {
  id: string;
  agentId: string | null;
  agentName: string;
  summary: string;
  eventType: string;
  outcome: "allowed" | "denied" | "info" | "failed";
  relativeTime: string;
  requestId: string | null;
  capabilityStatus: string | null;
};

function outcomeStyle(outcome: ActivityRow["outcome"]): string {
  if (outcome === "allowed") return "bg-[#e3f1e9] text-[#286148]";
  if (outcome === "denied" || outcome === "failed") {
    return "bg-[#f8e4e1] text-[#8b352d]";
  }
  return "bg-[#e9eef7] text-[#405986]";
}

export function ActivityWorkspace({
  agents,
  needsAction,
  activity,
}: {
  agents: ActivityAgent[];
  needsAction: NeedsActionRow[];
  activity: ActivityRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return activity.filter((row) => {
      const matchesQuery =
        normalized.length === 0 ||
        [row.agentName, row.summary, row.eventType]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesAgent = agentId === "all" || row.agentId === agentId;
      const matchesOutcome = outcome === "all" || row.outcome === outcome;

      return matchesQuery && matchesAgent && matchesOutcome;
    });
  }, [activity, agentId, outcome, query]);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 300);
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-[#e0e5df] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf4ef] text-[#2f6b55]">
              <Activity aria-hidden="true" className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-[#14231f]">
              All activity
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#6a7671]">
            Authority requests, policy decisions and capability lifecycle events.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d7ded8] bg-white px-3.5 py-2 text-sm font-medium text-[#45524c] transition-[border-color,background-color,transform] hover:border-[#b7c6bc] hover:bg-[#f8faf8] active:scale-[0.98]"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        <div
          role="note"
          className="mb-6 flex items-start gap-3 rounded-xl border border-[#ead9ae] bg-[#fbf5e5] px-4 py-3 text-xs leading-5 text-[#755d25]"
        >
          <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Demo activity from the in-memory workspace. The audit ledger remains the
          append-only source; this view only filters and groups those records.
        </div>

        <section aria-labelledby="needs-action-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2
                id="needs-action-heading"
                className="text-sm font-semibold text-[#26352f]"
              >
                Needs action
              </h2>
              <p className="mt-0.5 text-xs text-[#74807a]">
                Requests waiting for a human decision.
              </p>
            </div>
            <span className="rounded-full bg-[#f7e9d6] px-2.5 py-1 text-xs font-semibold text-[#805b20]">
              {needsAction.length}
            </span>
          </div>

          {needsAction.length === 0 ? (
            <div className="rounded-2xl border border-[#dce2dc] bg-white p-6 text-center">
              <CheckCircle2
                aria-hidden="true"
                className="mx-auto h-5 w-5 text-[#4d9474]"
              />
              <p className="mt-2 text-sm font-medium text-[#405049]">
                No decisions are waiting
              </p>
            </div>
          ) : (
            <ul className="grid gap-3">
              {needsAction.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/console/requests/${row.id}`}
                    className="group grid gap-3 rounded-2xl border border-[#e5d5b8] bg-[#fffdf8] p-4 shadow-[0_1px_2px_rgba(20,35,31,0.025)] transition-[border-color,background-color] hover:border-[#d5bc8e] hover:bg-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f7e9d6] text-[#8a6223]">
                        <Clock3 aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[#26352f]">
                            {row.title}
                          </span>
                          <span className="rounded-full bg-[#f7e9d6] px-2 py-0.5 text-[0.65rem] font-semibold text-[#805b20]">
                            Needs approval
                          </span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#66736e]">
                          {row.description}
                        </span>
                        <span className="mt-1.5 block text-[0.7rem] text-[#7a8580]">
                          {row.agentName} · {row.approvalProgress} · {row.relativeTime}
                        </span>
                      </span>
                    </div>
                    <span className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                      <span className="text-xs font-medium text-[#805b20]">
                        {row.riskLabel}
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="h-4 w-4 text-[#9c8a6b] transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity-heading" className="mt-8">
          <div className="mb-3">
            <h2 id="activity-heading" className="text-sm font-semibold text-[#26352f]">
              Activity ledger
            </h2>
            <p className="mt-0.5 text-xs text-[#74807a]">
              A searchable operational projection of recorded audit events.
            </p>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_180px_180px]">
            <label className="relative sm:col-span-2 lg:col-span-1">
              <span className="sr-only">Search activity</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#89938f]"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events, agents or event types"
                className="h-10 w-full rounded-xl border border-[#dce2dc] bg-white pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#4b8b70] focus:ring-4 focus:ring-[#dcebe4]"
              />
            </label>
            <select
              aria-label="Filter activity by agent"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="h-10 rounded-xl border border-[#dce2dc] bg-white px-3 text-sm text-[#45524c] outline-none focus:border-[#4b8b70] focus:ring-4 focus:ring-[#dcebe4]"
            >
              <option value="all">All agents</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter activity by outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="h-10 rounded-xl border border-[#dce2dc] bg-white px-3 text-sm text-[#45524c] outline-none focus:border-[#4b8b70] focus:ring-4 focus:ring-[#dcebe4]"
            >
              <option value="all">Any outcome</option>
              <option value="allowed">Allowed</option>
              <option value="denied">Denied</option>
              <option value="info">Information</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#dce2dc] bg-white shadow-[0_1px_2px_rgba(20,35,31,0.03),0_18px_45px_rgba(20,35,31,0.035)]">
            <div className="hidden grid-cols-[minmax(150px,.65fr)_minmax(0,1.5fr)_130px_120px] gap-4 border-b border-[#e7ebe7] bg-[#f8faf8] px-5 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#85908b] md:grid">
              <span>Agent</span>
              <span>Event</span>
              <span>Recorded</span>
              <span>Outcome</span>
            </div>

            {filtered.length === 0 ? (
              <div className="grid min-h-52 place-items-center p-6 text-center">
                <div>
                  <Activity
                    aria-hidden="true"
                    className="mx-auto h-6 w-6 text-[#9ba49f]"
                  />
                  <p className="mt-3 text-sm font-medium text-[#405049]">
                    No activity matches these filters
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[#e9ede9]">
                {filtered.map((row) => {
                  const content = (
                    <>
                      <span className="text-xs font-medium text-[#46534e]">
                        {row.agentName}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-[#26352f]">
                          {row.summary}
                        </span>
                        <span className="mt-1 block text-[0.68rem] font-medium text-[#84908b]">
                          {row.eventType}
                          {row.capabilityStatus
                            ? ` · capability ${row.capabilityStatus}`
                            : ""}
                        </span>
                      </span>
                      <span className="text-xs text-[#74807a]">
                        {row.relativeTime}
                      </span>
                      <span>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-semibold capitalize ${outcomeStyle(row.outcome)}`}
                        >
                          {row.outcome}
                        </span>
                      </span>
                    </>
                  );

                  return (
                    <li key={row.id}>
                      {row.requestId ? (
                        <Link
                          href={`/console/requests/${row.requestId}`}
                          className="grid gap-2 px-4 py-4 transition-colors hover:bg-[#f7faf7] focus-visible:outline-offset-[-3px] md:grid-cols-[minmax(150px,.65fr)_minmax(0,1.5fr)_130px_120px] md:items-center md:gap-4 md:px-5"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="grid gap-2 px-4 py-4 md:grid-cols-[minmax(150px,.65fr)_minmax(0,1.5fr)_130px_120px] md:items-center md:gap-4 md:px-5">
                          {content}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
