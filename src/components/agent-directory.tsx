"use client";

import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CirclePause,
  Search,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { CreateAgentDraftState } from "@/app/console/actions";

type AgentRow = {
  id: string;
  name: string;
  jobDescription: string;
  managerId: string;
  managerName: string;
  status: "active" | "paused";
  riskTier: "low" | "medium" | "high";
  permissions: string[];
  requestCount: number;
  liveCapabilityCount: number;
  blueprintId: string | null;
  blueprintStatus: "draft" | "published" | null;
};

type ManagerOption = { id: string; name: string };

type DraftInput = {
  name: string;
  jobDescription: string;
  managerId: string;
  riskTier: "low" | "medium" | "high";
  permission: "none" | "capped_payment";
  template: "blank" | "bounded_payment" | "review_only";
};

const TEMPLATES: {
  id: DraftInput["template"];
  title: string;
  description: string;
  jobDescription: string;
  permission: DraftInput["permission"];
  riskTier: DraftInput["riskTier"];
}[] = [
  {
    id: "blank",
    title: "Start from scratch",
    description: "An empty, paused draft with no implied authority.",
    jobDescription: "",
    permission: "none",
    riskTier: "low",
  },
  {
    id: "bounded_payment",
    title: "Bounded payment operator",
    description: "Prefills a policy gate, a capped action and manager notification.",
    jobDescription:
      "Prepares a bounded payment request and sends it through live policy review before any authority can be issued.",
    permission: "capped_payment",
    riskTier: "high",
  },
  {
    id: "review_only",
    title: "Human review assistant",
    description: "Prepares a proposal and notifies its manager without action authority.",
    jobDescription:
      "Gathers context, prepares a proposal and routes it to an accountable human without requesting execution authority.",
    permission: "none",
    riskTier: "medium",
  },
];

const FIELD_CLASS =
  "mt-1.5 w-full rounded-xl border border-[#d9e0da] bg-white px-3 py-2.5 text-sm text-[#14231f] shadow-[0_1px_1px_rgba(20,35,31,0.02)] outline-none transition-[border-color,box-shadow] focus:border-[#4b8b70] focus:ring-4 focus:ring-[#dcebe4]";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function AgentDraftDialog({
  open,
  managers,
  onClose,
  createAction,
}: {
  open: boolean;
  managers: ManagerOption[];
  onClose: () => void;
  createAction: (input: DraftInput) => Promise<CreateAgentDraftState>;
}) {
  const router = useRouter();
  const firstField = useRef<HTMLInputElement>(null);
  const defaultManager = managers[0];
  const [input, setInput] = useState<DraftInput>({
    name: "",
    jobDescription: "",
    managerId: defaultManager?.id ?? "",
    riskTier: "low",
    permission: "none",
    template: "blank",
  });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CreateAgentDraftState>({});

  const close = useCallback(() => {
    onClose();
    router.replace("/console/agents", { scroll: false });
  }, [onClose, router]);

  useEffect(() => {
    if (!open) return;
    firstField.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  if (!open) return null;

  function chooseTemplate(templateId: DraftInput["template"]) {
    const template = TEMPLATES.find((candidate) => candidate.id === templateId);
    if (!template) return;

    setInput((current) => ({
      ...current,
      template: template.id,
      jobDescription: template.jobDescription,
      permission: template.permission,
      riskTier: template.riskTier,
    }));
    setResult({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult({});

    try {
      const next = await createAction(input);
      setResult(next);

      if (next.blueprintId) {
        router.push(`/console/agents/builder?blueprint=${next.blueprintId}`);
      }
    } catch {
      setResult({ error: "Could not reach the server. No draft was created." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close new agent dialog"
        className="absolute inset-0 bg-[#0f211b]/45 backdrop-blur-[2px]"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-agent-title"
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[1.35rem] border border-white/70 bg-[#fbfcfa] shadow-[0_30px_90px_rgba(13,35,27,0.24)] sm:max-h-[calc(100vh-3rem)]"
      >
        <header className="flex items-center justify-between border-b border-[#e2e7e1] px-5 py-4 sm:px-7">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#dcebe4] text-[#2f6b55]">
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
              <h2
                id="new-agent-title"
                className="text-lg font-semibold tracking-[-0.02em] text-[#14231f]"
              >
                New agent draft
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#72807a]">
              Creates a paused, in-memory configuration. It grants no authority.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close dialog"
            className="grid h-9 w-9 place-items-center rounded-lg text-[#66736e] transition-colors hover:bg-[#edf1ed] active:scale-[0.97]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-[#e2e7e1] bg-[#f4f6f2] p-4 md:overflow-y-auto md:border-b-0 md:border-r">
            <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#84908b]">
              Supported starting points
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 md:grid-cols-1">
              {TEMPLATES.map((template) => {
                const selected = input.template === template.id;

                return (
                  <button
                    type="button"
                    key={template.id}
                    onClick={() => chooseTemplate(template.id)}
                    aria-pressed={selected}
                    className={`rounded-xl border p-3 text-left transition-[border-color,background-color,transform] active:scale-[0.99] ${
                      selected
                        ? "border-[#8db5a3] bg-white shadow-[0_1px_2px_rgba(20,35,31,0.04)]"
                        : "border-transparent hover:border-[#d8dfd9] hover:bg-white/70"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3 text-sm font-semibold text-[#24342e]">
                      {template.title}
                      {selected ? (
                        <Check aria-hidden="true" className="h-4 w-4 text-[#2f6b55]" />
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#6b7772]">
                      {template.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <form onSubmit={submit} className="min-h-0 overflow-y-auto p-5 sm:p-7">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-start gap-3 rounded-xl border border-[#d5e4dc] bg-[#f0f7f3] p-3.5">
                <Shield aria-hidden="true" className="mt-0.5 h-4 w-4 text-[#2f6b55]" />
                <p className="text-xs leading-5 text-[#466156]">
                  Drafts start paused. Publishing still runs server-side checks for
                  live policy, permissions, agent status and workspace ownership.
                </p>
              </div>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="text-xs font-semibold text-[#53605b] sm:col-span-2">
                  Agent name
                  <input
                    ref={firstField}
                    required
                    minLength={3}
                    maxLength={80}
                    value={input.name}
                    onChange={(event) =>
                      setInput((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="e.g. Contract review agent"
                    className={FIELD_CLASS}
                  />
                </label>

                <label className="text-xs font-semibold text-[#53605b] sm:col-span-2">
                  Job and accountability scope
                  <textarea
                    required
                    minLength={10}
                    maxLength={400}
                    rows={4}
                    value={input.jobDescription}
                    onChange={(event) =>
                      setInput((current) => ({
                        ...current,
                        jobDescription: event.target.value,
                      }))
                    }
                    placeholder="Describe what this agent prepares, what it may request, and where a human remains accountable."
                    className={`${FIELD_CLASS} resize-y`}
                  />
                </label>

                <label className="text-xs font-semibold text-[#53605b]">
                  Accountable manager
                  <select
                    required
                     value={input.managerId}
                     onChange={(event) =>
                       setInput((current) => ({
                         ...current,
                         managerId: event.target.value,
                       }))
                     }
                     className={FIELD_CLASS}
                  >
                     {managers.map((manager) => (
                       <option key={manager.id} value={manager.id}>
                         {manager.name}
                       </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-[#53605b]">
                  Risk tier
                  <select
                    value={input.riskTier}
                    onChange={(event) =>
                      setInput((current) => ({
                        ...current,
                        riskTier: event.target.value as DraftInput["riskTier"],
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <fieldset className="sm:col-span-2">
                  <legend className="text-xs font-semibold text-[#53605b]">
                    Requested permission envelope
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        value: "none" as const,
                        title: "No action authority",
                        copy: "May reason and notify, but cannot request execution.",
                      },
                      {
                        value: "capped_payment" as const,
                        title: "Capped payment requests",
                        copy: "May request authority only through an active payment policy.",
                      },
                    ].map((choice) => (
                      <label
                        key={choice.value}
                        className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                          input.permission === choice.value
                            ? "border-[#8db5a3] bg-[#f1f7f3]"
                            : "border-[#dfe5df] bg-white hover:border-[#b8c8bd]"
                        }`}
                      >
                        <span className="flex items-start gap-2">
                          <input
                            type="radio"
                            name="permission"
                            value={choice.value}
                            checked={input.permission === choice.value}
                            onChange={() =>
                              setInput((current) => ({
                                ...current,
                                permission: choice.value,
                              }))
                            }
                            className="mt-0.5 accent-[#2f6b55]"
                          />
                          <span>
                            <span className="block text-xs font-semibold text-[#24342e]">
                              {choice.title}
                            </span>
                            <span className="mt-0.5 block text-[0.7rem] leading-4 text-[#6d7974]">
                              {choice.copy}
                            </span>
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9e4] pt-5">
                <p aria-live="polite" className="min-h-5 text-xs">
                  {result.error ? (
                    <span className="text-[#a33b32]">{result.error}</span>
                  ) : result.message ? (
                    <span className="text-[#2f6b55]">{result.message}</span>
                  ) : (
                    <span className="text-[#7a8580]">
                      Stored in this demo server process only.
                    </span>
                  )}
                </p>
                <button
                  type="submit"
                  disabled={pending || managers.length === 0}
                  className="rounded-xl bg-[#2f6b55] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(20,35,31,0.12)] transition-[background-color,transform] hover:bg-[#285c4a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? "Creating draft…" : "Create paused draft"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

export function AgentDirectory({
  agents,
  managers,
  initialDialogOpen,
  createAction,
}: {
  agents: AgentRow[];
  managers: ManagerOption[];
  initialDialogOpen: boolean;
  createAction: (input: DraftInput) => Promise<CreateAgentDraftState>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AgentRow["status"]>("all");
  const [dialogOpen, setDialogOpen] = useState(initialDialogOpen);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return agents.filter((agent) => {
      const matchesStatus = status === "all" || agent.status === status;
      const matchesQuery =
        normalized.length === 0 ||
        [agent.name, agent.jobDescription, agent.managerName]
          .join(" ")
          .toLowerCase()
          .includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [agents, query, status]);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-[#e0e5df] bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.025em] text-[#14231f]">
              All agents
            </h1>
            <span className="rounded-full bg-[#eef2ee] px-2 py-0.5 text-[0.68rem] font-medium text-[#66736e]">
              {agents.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#6a7671]">
            Accountable identities and the authority each one may request.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2f6b55] px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#285c4a] active:scale-[0.98]"
        >
          <Bot aria-hidden="true" className="h-4 w-4" />
          New agent draft
        </button>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search agents</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#89938f]"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by agent, job or manager"
              className="h-10 w-full rounded-xl border border-[#dce2dc] bg-white pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-[#4b8b70] focus:ring-4 focus:ring-[#dcebe4]"
            />
          </label>
          <select
            aria-label="Filter agents by status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "all" | AgentRow["status"])
            }
            className="h-10 rounded-xl border border-[#dce2dc] bg-white px-3 text-sm text-[#44514c] outline-none focus:border-[#4b8b70] focus:ring-4 focus:ring-[#dcebe4]"
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[#dce2dc] bg-white shadow-[0_1px_2px_rgba(20,35,31,0.03),0_18px_45px_rgba(20,35,31,0.035)]">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(160px,.7fr)_110px_110px_32px] gap-4 border-b border-[#e7ebe7] bg-[#f8faf8] px-5 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#85908b] md:grid">
            <span>Agent</span>
            <span>Accountable manager</span>
            <span>Authority</span>
            <span>Activity</span>
            <span />
          </div>

          {filtered.length === 0 ? (
            <div className="grid min-h-56 place-items-center p-6 text-center">
              <div>
                <Bot aria-hidden="true" className="mx-auto h-6 w-6 text-[#9ba49f]" />
                <p className="mt-3 text-sm font-medium text-[#405049]">
                  No agents match these filters
                </p>
                <p className="mt-1 text-xs text-[#76817c]">
                  Clear the search or choose another status.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-[#e9ede9]">
              {filtered.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/console/agents/builder?agent=${agent.id}`}
                    className="group grid gap-3 px-4 py-4 transition-colors hover:bg-[#f7faf7] focus-visible:outline-offset-[-3px] md:grid-cols-[minmax(0,1.6fr)_minmax(160px,.7fr)_110px_110px_32px] md:items-center md:gap-4 md:px-5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf4ef] text-xs font-bold text-[#2f6b55] ring-1 ring-inset ring-[#d6e3da]"
                      >
                        {initials(agent.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#1c2d27]">
                            {agent.name}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                              agent.status === "active"
                                ? "bg-[#e3f1e9] text-[#286148]"
                                : "bg-[#f8edda] text-[#805b20]"
                            }`}
                          >
                            {agent.status === "paused" ? (
                              <CirclePause aria-hidden="true" className="h-2.5 w-2.5" />
                            ) : null}
                            {agent.status}
                          </span>
                          {agent.blueprintStatus ? (
                            <span className="rounded-full bg-[#eef1ee] px-2 py-0.5 text-[0.65rem] font-medium text-[#66736e]">
                              {agent.blueprintStatus} flow
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#66736e]">
                          {agent.jobDescription}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-[0.68rem] font-medium uppercase tracking-wide text-[#8a948f] md:hidden">
                        Manager
                      </span>
                      <span className="text-xs font-medium text-[#46534e]">
                        {agent.managerName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-[0.68rem] font-medium uppercase tracking-wide text-[#8a948f] md:hidden">
                        Authority
                      </span>
                      <span className="text-xs text-[#56635d]">
                        {agent.permissions.length === 0
                          ? "None"
                          : `${agent.permissions.length} permission`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 md:block">
                      <span className="text-[0.68rem] font-medium uppercase tracking-wide text-[#8a948f] md:hidden">
                        Activity
                      </span>
                      <span className="text-xs tabular-nums text-[#56635d]">
                        {agent.requestCount} request{agent.requestCount === 1 ? "" : "s"}
                        {agent.liveCapabilityCount > 0
                          ? ` · ${agent.liveCapabilityCount} live`
                          : ""}
                      </span>
                    </div>

                    <ChevronRight
                      aria-hidden="true"
                      className="hidden h-4 w-4 text-[#9ca59f] transition-transform group-hover:translate-x-0.5 md:block"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#74807a]">
          <p>Demo records. Drafts and edits reset with the server process.</p>
          <Link
            href="/console/policies"
            className="inline-flex items-center gap-1 font-medium text-[#2f6b55] hover:underline"
          >
            Inspect live policies
            <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <AgentDraftDialog
        open={dialogOpen}
        managers={managers}
        onClose={() => setDialogOpen(false)}
        createAction={createAction}
      />
    </>
  );
}
