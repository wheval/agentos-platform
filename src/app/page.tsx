import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Fingerprint,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Network,
  ScrollText,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { demoData } from "@/lib/demo-data";

const navItems = [
  { label: "Overview", href: "#overview", icon: LayoutDashboard },
  { label: "Agents", href: "#agents", icon: Bot },
  { label: "Policies", href: "#policies", icon: ShieldCheck },
  { label: "Requests", href: "#requests", icon: FileCheck2 },
  { label: "Approvals", href: "#approvals", icon: UserRoundCheck },
  { label: "Audit", href: "#audit", icon: ScrollText },
];

const requestStateHelp: Record<string, string> = {
  pending_approval: "1 of 2 approvals",
  capability_issued: "5 minute demo grant",
  denied: "Policy blocked",
  succeeded: "Demo execution recorded",
};

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export default function Home() {
  const activeAgents = demoData.agents.filter(
    (agent) => agent.status === "active",
  ).length;
  const pendingRequests = demoData.requests.filter(
    (request) => request.state === "pending_approval",
  ).length;
  const activePolicies = demoData.policies.filter(
    (policy) => policy.status === "active",
  ).length;

  return (
    <div className="dashboard-grid min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[#142821] text-white lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#dff3e7] text-[#173c2e]">
            <Fingerprint aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-[1.05rem] font-semibold tracking-tight">AgentOS</p>
            <p className="text-xs text-[#9fb5ac]">Private control plane</p>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-6">
          <p className="px-3 pb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#7f9a8f]">
            Workspace
          </p>
          <ul className="space-y-1">
            {navItems.map((item, index) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    index === 0
                      ? "bg-white/10 font-medium text-white"
                      : "text-[#b9cbc4] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon aria-hidden="true" className="size-4" />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/[0.06] p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#e8cfa2] text-xs font-bold text-[#3d2d15]">
                MC
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Maya Chen</p>
                <p className="truncate text-xs text-[#9fb5ac]">Control owner</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-[#dce2dc] bg-[#f8f9f6]/95 backdrop-blur">
          <div className="mx-auto flex min-h-20 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-xl bg-[#173c2e] text-white">
                <Fingerprint aria-hidden="true" className="size-5" />
              </div>
              <span className="font-semibold">AgentOS</span>
            </div>
            <div className="hidden items-center gap-2 text-sm text-[#66736e] lg:flex">
              <span>Northstar Labs</span>
              <ChevronRight aria-hidden="true" className="size-4" />
              <span className="font-medium text-[#203a31]">Operations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d9ded9] bg-white px-3 py-1.5 text-xs font-semibold text-[#475a53]">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Demo workspace
              </span>
              <span className="hidden rounded-full border border-[#d9ded9] bg-white px-3 py-1.5 font-mono text-xs text-[#66736e] sm:inline">
                31 Jul 2026 · 13:04 UTC
              </span>
            </div>
          </div>
          <nav
            aria-label="Mobile navigation"
            className="overflow-x-auto border-t border-[#e2e6e1] px-4 lg:hidden"
          >
            <ul className="flex min-w-max gap-5">
              {navItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block py-3 text-xs font-semibold text-[#52635d]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <main
          id="main-content"
          className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
        >
          <section id="overview" aria-labelledby="overview-heading">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#5d746b]">
                  <span className="h-px w-7 bg-[#6f8f82]" />
                  Operator dashboard
                </div>
                <h1
                  id="overview-heading"
                  className="text-3xl font-semibold tracking-[-0.035em] text-[#142821] sm:text-4xl"
                >
                  Control room
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66736e] sm:text-base">
                  Govern agent actions before authority is granted. All records
                  on this screen are validated, static demo data.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#cfddd5] bg-[#eaf4ee] px-4 py-3 text-sm text-[#285440]">
                <ShieldCheck aria-hidden="true" className="size-5" />
                <span>
                  <strong className="font-semibold">Policy engine</strong>{" "}
                  simulation healthy
                </span>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Active agents",
                  value: `${activeAgents}`,
                  detail: `${demoData.agents.length} configured`,
                  icon: Bot,
                },
                {
                  label: "Awaiting approval",
                  value: `${pendingRequests}`,
                  detail: "Oldest · 13 minutes",
                  icon: Clock3,
                },
                {
                  label: "Active policies",
                  value: `${activePolicies}`,
                  detail: "1 draft policy",
                  icon: ShieldCheck,
                },
                {
                  label: "Demo grants",
                  value: `${demoData.capabilities.length}`,
                  detail: "Bounded · short-lived",
                  icon: KeyRound,
                },
              ].map((metric) => (
                <article
                  key={metric.label}
                  className="card-shadow rounded-2xl border border-[#dde2dc] bg-white p-5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-[#71807a]">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#152b23]">
                        {metric.value}
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-[#edf3ef] text-[#35644f]">
                      <metric.icon aria-hidden="true" className="size-5" />
                    </div>
                  </div>
                  <p className="mt-4 text-xs text-[#7b8883]">{metric.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section
              id="requests"
              aria-labelledby="requests-heading"
              className="card-shadow overflow-hidden rounded-2xl border border-[#dde2dc] bg-white xl:col-span-8"
            >
              <div className="flex items-center justify-between border-b border-[#e5e8e4] px-5 py-4 sm:px-6">
                <div>
                  <h2
                    id="requests-heading"
                    className="font-semibold tracking-[-0.02em] text-[#183128]"
                  >
                    Action requests
                  </h2>
                  <p className="mt-1 text-xs text-[#78857f]">
                    Capped-payment workflow · demo only
                  </p>
                </div>
                <CircleDollarSign
                  aria-hidden="true"
                  className="size-5 text-[#537064]"
                />
              </div>

              <div className="divide-y divide-[#edf0ed]">
                {demoData.requests.map((request) => (
                  <article
                    key={request.id}
                    className="grid gap-4 px-5 py-5 transition-colors hover:bg-[#fafbf9] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3ef] font-mono text-xs font-semibold text-[#315947]">
                        {initials(request.input.counterpartyName)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="truncate text-sm font-semibold text-[#20382f]">
                            {request.input.counterpartyName}
                          </h3>
                          <StatusPill status={request.state} />
                        </div>
                        <p className="mt-1.5 truncate text-xs text-[#7a8782]">
                          {request.input.reference} · Finance control ·{" "}
                          {request.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-5 pl-14 sm:justify-end sm:pl-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-[#20382f]">
                          {formatMoney(
                            request.input.amountMinor,
                            request.input.currency,
                          )}
                        </p>
                        <p className="mt-1 text-xs text-[#7a8782]">
                          {requestStateHelp[request.state]}
                        </p>
                      </div>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-[#9aa49f]"
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section
              id="approvals"
              aria-labelledby="approvals-heading"
              className="card-shadow rounded-2xl border border-[#dde2dc] bg-white xl:col-span-4"
            >
              <div className="border-b border-[#e5e8e4] px-5 py-4">
                <h2
                  id="approvals-heading"
                  className="font-semibold tracking-[-0.02em] text-[#183128]"
                >
                  Approval queue
                </h2>
                <p className="mt-1 text-xs text-[#78857f]">
                  Human decisions remain explicit
                </p>
              </div>
              <div className="p-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <StatusPill status="pending_approval" />
                      <h3 className="mt-3 text-sm font-semibold text-[#473916]">
                        Acme Cloud · INV-1048
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[#746534]">
                        One additional authorized reviewer is required.
                      </p>
                    </div>
                    <p className="font-mono text-xs font-semibold text-amber-800">
                      1 / 2
                    </p>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-amber-200">
                    <div className="h-full w-1/2 rounded-full bg-amber-600" />
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7a8782]">
                    Recorded decisions
                  </p>
                  <ul className="mt-3 space-y-4">
                    {demoData.approvals.slice(0, 3).map((approval) => (
                      <li key={approval.id} className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-[#dfeae4] text-[0.65rem] font-bold text-[#315947]">
                          {initials(approval.approverName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-[#31443d]">
                            {approval.approverName}
                          </p>
                          <p className="mt-0.5 text-[0.68rem] text-[#87918d]">
                            {formatTime(approval.createdAt)} UTC
                          </p>
                        </div>
                        <Check
                          aria-label="Approved"
                          className="size-4 text-emerald-600"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section
              id="policies"
              aria-labelledby="policies-heading"
              className="card-shadow rounded-2xl border border-[#dde2dc] bg-white xl:col-span-5"
            >
              <div className="flex items-center justify-between border-b border-[#e5e8e4] px-5 py-4">
                <div>
                  <h2
                    id="policies-heading"
                    className="font-semibold tracking-[-0.02em] text-[#183128]"
                  >
                    Policy guardrails
                  </h2>
                  <p className="mt-1 text-xs text-[#78857f]">
                    Versioned, deterministic evaluation
                  </p>
                </div>
                <Gauge aria-hidden="true" className="size-5 text-[#537064]" />
              </div>
              <div className="divide-y divide-[#edf0ed]">
                {demoData.policies.map((policy) => (
                  <article key={policy.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-[#263d35]">
                            {policy.name}
                          </h3>
                          <StatusPill status={policy.status} />
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-[#78857f]">
                          {policy.description}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[0.68rem] text-[#87918d]">
                        v{policy.version}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[0.7rem] text-[#61736b]">
                      <span>
                        Cap{" "}
                        <strong className="font-semibold text-[#334c42]">
                          {formatMoney(
                            policy.constraints.maxAmountMinor,
                            policy.constraints.currency,
                          )}
                        </strong>
                      </span>
                      <span>
                        Approvals{" "}
                        <strong className="font-semibold text-[#334c42]">
                          {policy.approvalRule.threshold}
                        </strong>
                      </span>
                      <span>
                        TTL{" "}
                        <strong className="font-semibold text-[#334c42]">
                          {policy.constraints.capabilityTtlSeconds}s
                        </strong>
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section
              id="agents"
              aria-labelledby="agents-heading"
              className="card-shadow rounded-2xl border border-[#dde2dc] bg-white xl:col-span-7"
            >
              <div className="flex items-center justify-between border-b border-[#e5e8e4] px-5 py-4">
                <div>
                  <h2
                    id="agents-heading"
                    className="font-semibold tracking-[-0.02em] text-[#183128]"
                  >
                    Agent registry
                  </h2>
                  <p className="mt-1 text-xs text-[#78857f]">
                    Identity, role, manager, and scoped permission
                  </p>
                </div>
                <Bot aria-hidden="true" className="size-5 text-[#537064]" />
              </div>
              <div className="grid gap-px bg-[#edf0ed] sm:grid-cols-2">
                {demoData.agents.map((agent) => (
                  <article key={agent.id} className="bg-white p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#183a2d] text-xs font-bold text-white">
                        {initials(agent.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate text-sm font-semibold text-[#263d35]">
                            {agent.name}
                          </h3>
                          <StatusPill status={agent.status} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#78857f]">
                          {agent.jobDescription}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[#edf0ed] pt-3 text-[0.7rem] text-[#78857f]">
                      <span>Manager · {agent.managerName}</span>
                      <span className="capitalize">{agent.riskTier} risk</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section
              id="audit"
              aria-labelledby="audit-heading"
              className="card-shadow rounded-2xl border border-[#dde2dc] bg-white xl:col-span-7"
            >
              <div className="flex items-center justify-between border-b border-[#e5e8e4] px-5 py-4">
                <div>
                  <h2
                    id="audit-heading"
                    className="font-semibold tracking-[-0.02em] text-[#183128]"
                  >
                    Audit events
                  </h2>
                  <p className="mt-1 text-xs text-[#78857f]">
                    Structured local demo records · not immutable proofs
                  </p>
                </div>
                <ScrollText
                  aria-hidden="true"
                  className="size-5 text-[#537064]"
                />
              </div>
              <ol className="divide-y divide-[#edf0ed]">
                {demoData.auditEvents.map((event) => (
                  <li
                    key={event.id}
                    className="grid gap-2 px-5 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-start"
                  >
                    <time className="font-mono text-[0.68rem] text-[#87918d]">
                      {formatTime(event.occurredAt)}
                    </time>
                    <div>
                      <p className="text-xs font-semibold leading-5 text-[#31443d]">
                        {event.summary}
                      </p>
                      <p className="mt-1 text-[0.68rem] text-[#87918d]">
                        {event.actor.displayName} · {event.eventType}
                      </p>
                    </div>
                    <div className="sm:justify-self-end">
                      <StatusPill status={event.outcome} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section
              aria-labelledby="handoffs-heading"
              className="card-shadow rounded-2xl border border-[#dde2dc] bg-white xl:col-span-5"
            >
              <div className="flex items-center justify-between border-b border-[#e5e8e4] px-5 py-4">
                <div>
                  <h2
                    id="handoffs-heading"
                    className="font-semibold tracking-[-0.02em] text-[#183128]"
                  >
                    Governed handoffs
                  </h2>
                  <p className="mt-1 text-xs text-[#78857f]">
                    Compartmentalized agent-to-agent context
                  </p>
                </div>
                <Network aria-hidden="true" className="size-5 text-[#537064]" />
              </div>
              <div className="space-y-3 p-5">
                {demoData.handoffs.map((handoff) => {
                  const sender = demoData.agents.find(
                    (agent) => agent.id === handoff.fromAgentId,
                  );
                  const receiver = demoData.agents.find(
                    (agent) => agent.id === handoff.toAgentId,
                  );

                  return (
                    <article
                      key={handoff.id}
                      className="rounded-xl border border-[#e2e7e2] p-4"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#30473e]">
                        <span>{sender?.name}</span>
                        <ArrowRight
                          aria-hidden="true"
                          className="size-3.5 text-[#789087]"
                        />
                        <span>{receiver?.name}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[#78857f]">
                        {handoff.purpose}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="font-mono text-[0.65rem] uppercase tracking-wide text-[#7d8a85]">
                          {handoff.dataClassification}
                        </span>
                        <StatusPill status={handoff.state} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <section
            aria-labelledby="boundary-heading"
            className="mt-6 overflow-hidden rounded-2xl bg-[#183128] text-white"
          >
            <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9ec3b3]">
                  <LockKeyhole aria-hidden="true" className="size-4" />
                  Explicit trust boundary
                </div>
                <h2
                  id="boundary-heading"
                  className="mt-4 max-w-xl text-2xl font-semibold tracking-[-0.03em]"
                >
                  Policy approval is not credential custody.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b9cbc4]">
                  This foundation evaluates typed demo requests and models
                  bounded grants. It does not hold secrets, move money, or
                  produce Midnight proofs.
                </p>
              </div>
              <div className="border-t border-white/10 bg-white/[0.04] p-6 sm:p-8 lg:border-l lg:border-t-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9ec3b3]">
                  Next vertical slice
                </p>
                <p className="mt-3 text-sm leading-6 text-[#d7e2dd]">
                  Connect an isolated vault adapter to a sandbox payment
                  connector, then bind issuance to an approval receipt and
                  idempotent execution record.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
