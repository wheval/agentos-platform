"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  FlaskConical,
  LockKeyhole,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useReducer, useState } from "react";
import { FlowCanvas } from "@/components/flow-canvas";
import { validateBlueprint } from "@/application/blueprint-validation";
import type {
  AgentBlueprint,
  BlueprintStep,
  BlueprintStepKind,
} from "@/domain/blueprint";
import type { Agent, Policy } from "@/domain/schemas";

/**
 * The interactive half of the builder.
 *
 * Validation runs in the browser on every edit so the operator sees a broken
 * flow while they are making it, not after they submit. It is re-run on the
 * server before anything is stored: this copy is for feedback, never for
 * enforcement.
 */

type EditorState = {
  blueprint: AgentBlueprint;
  selectedNodeId: string | null;
  nextId: number;
};

export type BuilderActivity = {
  id: string;
  summary: string;
  eventType: string;
  outcome: "allowed" | "denied" | "info" | "failed";
  relativeTime: string;
  requestId: string | null;
};

type EditorAction =
  | { type: "select"; nodeId: string | null }
  | { type: "insert"; branchId: string | null; index: number; kind: BlueprintStepKind }
  | { type: "update"; nodeId: string; patch: Partial<Record<string, unknown>> }
  | { type: "remove"; nodeId: string }
  | { type: "assign"; agentId: string | null }
  | { type: "trigger"; label: string };

function newStep(kind: BlueprintStepKind, seq: number, fallbackPolicy: string): BlueprintStep {
  const nodeId = `nd_new${seq}`;

  switch (kind) {
    case "step":
      return { kind: "step", id: nodeId, label: "Untitled step" };
    case "policy_gate":
      return { kind: "policy_gate", id: nodeId, policyId: fallbackPolicy };
    case "action":
      return {
        kind: "action",
        id: nodeId,
        actionKind: "capped_payment",
        label: "Untitled action",
      };
    case "notify":
      return {
        kind: "notify",
        id: nodeId,
        audience: "manager",
        label: "Notify the manager",
      };
  }
}

function mapSteps(
  steps: BlueprintStep[],
  nodeId: string,
  patch: Partial<Record<string, unknown>>,
): BlueprintStep[] {
  return steps.map((step) =>
    step.id === nodeId ? ({ ...step, ...patch } as BlueprintStep) : step,
  );
}

function reduce(state: EditorState, action: EditorAction, fallbackPolicy: string): EditorState {
  const { blueprint } = state;

  switch (action.type) {
    case "select":
      return { ...state, selectedNodeId: action.nodeId };

    case "assign":
      return { ...state, blueprint: { ...blueprint, agentId: action.agentId } };

    case "trigger":
      return {
        ...state,
        blueprint: {
          ...blueprint,
          trigger: { ...blueprint.trigger, label: action.label },
        },
      };

    case "insert": {
      const step = newStep(action.kind, state.nextId, fallbackPolicy);

      if (action.branchId === null) {
        const steps = [...blueprint.steps];
        steps.splice(action.index, 0, step);

        return {
          blueprint: { ...blueprint, steps },
          selectedNodeId: step.id,
          nextId: state.nextId + 1,
        };
      }

      if (!blueprint.branching) return state;

      return {
        blueprint: {
          ...blueprint,
          branching: {
            ...blueprint.branching,
            branches: blueprint.branching.branches.map((branch) => {
              if (branch.id !== action.branchId) return branch;

              const steps = [...branch.steps];
              steps.splice(action.index, 0, step);

              return { ...branch, steps };
            }),
          },
        },
        selectedNodeId: step.id,
        nextId: state.nextId + 1,
      };
    }

    case "update":
      return {
        ...state,
        blueprint: {
          ...blueprint,
          steps: mapSteps(blueprint.steps, action.nodeId, action.patch),
          branching: blueprint.branching
            ? {
                ...blueprint.branching,
                branches: blueprint.branching.branches.map((branch) => ({
                  ...branch,
                  steps: mapSteps(branch.steps, action.nodeId, action.patch),
                })),
              }
            : null,
        },
      };

    case "remove":
      return {
        selectedNodeId: null,
        nextId: state.nextId,
        blueprint: {
          ...blueprint,
          steps: blueprint.steps.filter((step) => step.id !== action.nodeId),
          branching: blueprint.branching
            ? {
                ...blueprint.branching,
                branches: blueprint.branching.branches.map((branch) => ({
                  ...branch,
                  steps: branch.steps.filter((step) => step.id !== action.nodeId),
                })),
              }
            : null,
        },
      };
  }
}

const STEP_CHOICES: { kind: BlueprintStepKind; label: string; hint: string }[] = [
  { kind: "step", label: "Step", hint: "Work that carries no authority" },
  { kind: "policy_gate", label: "Policy gate", hint: "Bounds everything below it" },
  { kind: "action", label: "Action", hint: "Requests real authority" },
  { kind: "notify", label: "Notify", hint: "Tells a human" },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-[#dde2dc] bg-white px-3 py-2 text-sm text-[#14231f] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2f6b55]";

const LABEL_CLASS = "block text-xs font-medium uppercase tracking-wide text-[#66736e]";

export function BlueprintBuilder({
  initialBlueprint,
  policies,
  agents,
  activity,
  saveAction,
}: {
  initialBlueprint: AgentBlueprint;
  policies: Policy[];
  agents: Agent[];
  activity: BuilderActivity[];
  saveAction: (blueprint: AgentBlueprint, publish: boolean) => Promise<{ error?: string; message?: string }>;
}) {
  const activePolicies = policies.filter((policy) => policy.status === "active");
  const fallbackPolicy = activePolicies[0]?.id ?? policies[0]?.id ?? "pol_unknown";

  const [state, dispatch] = useReducer(
    (current: EditorState, action: EditorAction) => reduce(current, action, fallbackPolicy),
    { blueprint: initialBlueprint, selectedNodeId: null, nextId: 1 },
  );

  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const [mode, setMode] = useState<"configure" | "activity">("configure");
  const [previewedAt, setPreviewedAt] = useState<string | null>(null);

  const validation = useMemo(
    () => validateBlueprint({ blueprint: state.blueprint, policies, agents }),
    [state.blueprint, policies, agents],
  );
  const blueprintFingerprint = useMemo(
    () => JSON.stringify(state.blueprint),
    [state.blueprint],
  );

  const blocking = validation.issues.filter((issue) => issue.severity === "blocking");
  const warnings = validation.issues.filter((issue) => issue.severity === "warning");

  const policyName = (policyId: string) =>
    policies.find((policy) => policy.id === policyId)?.name ?? policyId;

  const allSteps: BlueprintStep[] = [
    ...state.blueprint.steps,
    ...(state.blueprint.branching?.branches.flatMap((branch) => branch.steps) ?? []),
  ];

  const selected = allSteps.find((step) => step.id === state.selectedNodeId) ?? null;
  const assignedAgent =
    agents.find((agent) => agent.id === state.blueprint.agentId) ?? null;
  const actionCount = allSteps.filter((step) => step.kind === "action").length;
  const gateCount = allSteps.filter((step) => step.kind === "policy_gate").length;

  const [insertTarget, setInsertTarget] = useState<{
    branchId: string | null;
    index: number;
  } | null>(null);

  async function save(publish: boolean) {
    setPending(true);
    setResult({});

    try {
      setResult(await saveAction(state.blueprint, publish));
    } catch {
      setResult({ error: "Could not reach the server. Nothing was saved." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Agent workspace"
          className="inline-flex rounded-xl border border-[#dce2dc] bg-white p-1 shadow-[0_1px_2px_rgba(20,35,31,0.03)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "configure"}
            onClick={() => setMode("configure")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "configure"
                ? "bg-[#e8f1eb] text-[#214d3d]"
                : "text-[#68746f] hover:text-[#24342e]"
            }`}
          >
            <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
            Configure
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "activity"}
            onClick={() => setMode("activity")}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              mode === "activity"
                ? "bg-[#e8f1eb] text-[#214d3d]"
                : "text-[#68746f] hover:text-[#24342e]"
            }`}
          >
            <Activity aria-hidden="true" className="h-3.5 w-3.5" />
            Activity
            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[0.62rem] tabular-nums text-[#6f7a75]">
              {activity.length}
            </span>
          </button>
        </div>
        <span className="hidden text-xs text-[#7a8580] sm:block">
          {state.blueprint.status === "published" ? "Published flow" : "Draft flow"}
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {mode === "configure" ? (
            <div className="space-y-4">
              {blocking.length > 0 ? (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-[#e7c8c4] bg-[#fbecea] p-4 text-sm text-[#7f2f28]"
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <div>
                    <p className="font-semibold">
                      {blocking.length === 1
                        ? "One control blocks publishing"
                        : `${blocking.length} controls block publishing`}
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5">
                      {blocking.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>{issue.message}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-[#c9ded2] bg-[#eff6f2] p-4 text-sm text-[#1f4c3d]"
                >
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <div>
                    <p className="font-semibold">
                      Every action is downstream of a live policy gate.
                    </p>
                    {warnings.length > 0 ? (
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-[#52625c]">
                        {warnings.map((issue, index) => (
                          <li key={`${issue.code}-${index}`}>{issue.message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
                <section className="min-w-0 rounded-2xl border border-[#dce2dc] bg-[#f8faf8] p-4 shadow-[0_1px_2px_rgba(20,35,31,0.025)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[#26352f]">
                        Governed flow
                      </h2>
                      <p className="mt-0.5 text-xs text-[#74807a]">
                        Select a node to configure it. Additions remain a draft.
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-medium text-[#66736e] ring-1 ring-inset ring-[#dce2dc]">
                      {actionCount} action{actionCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <FlowCanvas
                    blueprint={state.blueprint}
                    issues={validation.issues}
                    policyName={policyName}
                    selectedNodeId={state.selectedNodeId}
                    onSelectNode={(nodeId) => dispatch({ type: "select", nodeId })}
                    onInsertStep={setInsertTarget}
                  />
                </section>

                <div className="space-y-4">
                  <section className="rounded-xl border border-[#dce2dc] bg-white p-4">
                    <h2 className="text-sm font-semibold text-[#26352f]">
                      Accountability
                    </h2>
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className={LABEL_CLASS} htmlFor="blueprint-agent">
                          Accountable agent
                        </label>
                        <select
                          id="blueprint-agent"
                          className={`${FIELD_CLASS} mt-1`}
                          value={state.blueprint.agentId ?? ""}
                          onChange={(event) =>
                            dispatch({
                              type: "assign",
                              agentId: event.target.value || null,
                            })
                          }
                        >
                          <option value="">Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                              {agent.status === "paused" ? " (paused)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      {assignedAgent ? (
                        <dl className="grid gap-2 rounded-lg bg-[#f6f8f6] p-3 text-xs">
                          <div className="flex justify-between gap-3">
                            <dt className="text-[#74807a]">Manager</dt>
                            <dd className="text-right font-medium text-[#3f4d47]">
                              {assignedAgent.managerName}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-[#74807a]">Permission</dt>
                            <dd className="text-right font-medium text-[#3f4d47]">
                              {assignedAgent.permissions.length === 0
                                ? "None"
                                : assignedAgent.permissions.join(", ")}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-[#74807a]">Status</dt>
                            <dd className="text-right font-medium capitalize text-[#3f4d47]">
                              {assignedAgent.status}
                            </dd>
                          </div>
                        </dl>
                      ) : null}
                      <div>
                        <label className={LABEL_CLASS} htmlFor="blueprint-trigger">
                          Trigger
                        </label>
                        <input
                          id="blueprint-trigger"
                          className={`${FIELD_CLASS} mt-1`}
                          value={state.blueprint.trigger.label}
                          onChange={(event) =>
                            dispatch({ type: "trigger", label: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </section>

                  {insertTarget ? (
                    <section className="rounded-xl border border-[#6b9f87] bg-white p-4 shadow-[0_12px_30px_rgba(20,35,31,0.08)]">
                      <h2 className="text-sm font-semibold text-[#26352f]">
                        Add a node
                      </h2>
                      <div className="mt-3 space-y-2">
                        {STEP_CHOICES.map((choice) => (
                          <button
                            key={choice.kind}
                            type="button"
                            onClick={() => {
                              dispatch({
                                type: "insert",
                                ...insertTarget,
                                kind: choice.kind,
                              });
                              setInsertTarget(null);
                            }}
                            className="block w-full rounded-lg border border-[#dde2dc] px-3 py-2 text-left transition-[border-color,background-color,transform] hover:border-[#8eae9d] hover:bg-[#f7faf7] active:scale-[0.99]"
                          >
                            <span className="block text-sm font-medium text-[#26352f]">
                              {choice.label}
                            </span>
                            <span className="block text-xs text-[#74807a]">
                              {choice.hint}
                            </span>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setInsertTarget(null)}
                        className="mt-3 text-xs font-medium text-[#56635d] hover:underline"
                      >
                        Cancel
                      </button>
                    </section>
                  ) : null}

                  {selected ? (
                    <section className="rounded-xl border border-[#dce2dc] bg-white p-4">
                      <h2 className="text-sm font-semibold text-[#26352f]">
                        Configure node
                      </h2>
                      <div className="mt-3 space-y-3">
                        {selected.kind === "policy_gate" ? (
                          <div>
                            <label className={LABEL_CLASS} htmlFor="node-policy">
                              Live policy
                            </label>
                            <select
                              id="node-policy"
                              className={`${FIELD_CLASS} mt-1`}
                              value={selected.policyId}
                              onChange={(event) =>
                                dispatch({
                                  type: "update",
                                  nodeId: selected.id,
                                  patch: { policyId: event.target.value },
                                })
                              }
                            >
                              {policies.map((policy) => (
                                <option key={policy.id} value={policy.id}>
                                  {policy.name}
                                  {policy.status === "active"
                                    ? ""
                                    : ` (${policy.status})`}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className={LABEL_CLASS} htmlFor="node-label">
                              Label
                            </label>
                            <input
                              id="node-label"
                              className={`${FIELD_CLASS} mt-1`}
                              value={selected.label}
                              onChange={(event) =>
                                dispatch({
                                  type: "update",
                                  nodeId: selected.id,
                                  patch: { label: event.target.value },
                                })
                              }
                            />
                          </div>
                        )}

                        {selected.kind === "notify" ? (
                          <div>
                            <label className={LABEL_CLASS} htmlFor="node-audience">
                              Audience
                            </label>
                            <select
                              id="node-audience"
                              className={`${FIELD_CLASS} mt-1`}
                              value={selected.audience}
                              onChange={(event) =>
                                dispatch({
                                  type: "update",
                                  nodeId: selected.id,
                                  patch: { audience: event.target.value },
                                })
                              }
                            >
                              <option value="manager">Manager</option>
                              <option value="approvers">Approvers</option>
                              <option value="requester">Requester</option>
                            </select>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: "remove", nodeId: selected.id })
                          }
                          className="text-xs font-medium text-[#a33b32] hover:underline"
                        >
                          Remove this node
                        </button>
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-xl border border-[#dce2dc] bg-white p-4">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={pending || !validation.publishable}
                        onClick={() => void save(true)}
                        className="rounded-xl bg-[#2f6b55] px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#285c4a] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {pending ? "Saving…" : "Publish governed flow"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void save(false)}
                        className="rounded-xl border border-[#dce2dc] px-4 py-2.5 text-sm font-semibold text-[#26352f] transition-[border-color,background-color,transform] hover:border-[#b7c6bc] hover:bg-[#f8faf8] active:scale-[0.98] disabled:opacity-50"
                      >
                        Save draft
                      </button>
                    </div>
                    {!validation.publishable ? (
                      <p className="mt-2 text-xs leading-5 text-[#74807a]">
                        Server validation will refuse this publish even if a client
                        bypasses the disabled button.
                      </p>
                    ) : null}
                    <p aria-live="polite" className="mt-2 min-h-4 text-xs">
                      {result.error ? (
                        <span className="text-[#a33b32]">{result.error}</span>
                      ) : result.message ? (
                        <span className="text-[#2f6b55]">{result.message}</span>
                      ) : null}
                    </p>
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <section
              role="tabpanel"
              className="overflow-hidden rounded-2xl border border-[#dce2dc] bg-white shadow-[0_1px_2px_rgba(20,35,31,0.03)]"
            >
              <header className="border-b border-[#e7ebe7] px-5 py-4">
                <h2 className="text-sm font-semibold text-[#26352f]">
                  Agent activity
                </h2>
                <p className="mt-1 text-xs text-[#74807a]">
                  Recorded authority events linked to this agent. No simulated runs
                  are added here.
                </p>
              </header>
              {activity.length === 0 ? (
                <div className="grid min-h-72 place-items-center p-6 text-center">
                  <div>
                    <CircleDashed
                      aria-hidden="true"
                      className="mx-auto h-6 w-6 text-[#98a29d]"
                    />
                    <p className="mt-3 text-sm font-medium text-[#405049]">
                      No recorded activity
                    </p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-[#74807a]">
                      This draft has not requested authority. Configuring it does not
                      create audit events.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-[#e9ede9]">
                  {activity.map((event) => {
                    const row = (
                      <div className="flex items-start gap-3 px-5 py-4">
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                            event.outcome === "allowed"
                              ? "bg-[#55a87d]"
                              : event.outcome === "denied" ||
                                  event.outcome === "failed"
                                ? "bg-[#c45d52]"
                                : "bg-[#6682b8]"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-[#26352f]">
                            {event.summary}
                          </span>
                          <span className="mt-1 block text-[0.7rem] text-[#7a8580]">
                            {event.eventType.replaceAll(".", " ")} ·{" "}
                            {event.relativeTime}
                          </span>
                        </span>
                      </div>
                    );

                    return (
                      <li key={event.id}>
                        {event.requestId ? (
                          <Link
                            href={`/console/requests/${event.requestId}`}
                            className="block transition-colors hover:bg-[#f7faf7]"
                          >
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="min-w-0">
          <section className="overflow-hidden rounded-2xl border border-[#d7dfd9] bg-white shadow-[0_1px_2px_rgba(20,35,31,0.03),0_20px_45px_rgba(20,35,31,0.04)] xl:sticky xl:top-6">
            <header className="flex items-start gap-3 border-b border-[#e7ebe7] px-5 py-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#edf4ef] text-[#2f6b55]">
                <FlaskConical aria-hidden="true" className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[#26352f]">
                  Validation preview
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-[#74807a]">
                  Dry-run the control graph without requesting or exercising
                  authority.
                </p>
              </div>
            </header>

            <div className="p-5">
              <div className="flex items-start gap-3 rounded-xl border border-[#d5e4dc] bg-[#f0f7f3] p-3.5">
                <LockKeyhole
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6b55]"
                />
                <p className="text-xs leading-5 text-[#466156]">
                  No connector is called. No capability is issued. No funds move.
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#f6f8f6] p-3">
                  <dt className="text-[0.64rem] font-semibold uppercase tracking-wide text-[#84908b]">
                    Gates
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-[#26352f]">
                    {gateCount}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#f6f8f6] p-3">
                  <dt className="text-[0.64rem] font-semibold uppercase tracking-wide text-[#84908b]">
                    Actions
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-[#26352f]">
                    {actionCount}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#f6f8f6] p-3">
                  <dt className="text-[0.64rem] font-semibold uppercase tracking-wide text-[#84908b]">
                    Blocks
                  </dt>
                  <dd
                    className={`mt-1 text-lg font-semibold tabular-nums ${
                      blocking.length > 0 ? "text-[#a33b32]" : "text-[#2f6b55]"
                    }`}
                  >
                    {blocking.length}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#84908b]">
                  Control trace
                </p>
                <ol className="mt-3 space-y-0">
                  <li className="flex gap-3">
                    <span className="flex flex-col items-center">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#e8f1eb] text-[0.65rem] font-semibold text-[#2f6b55]">
                        1
                      </span>
                      {allSteps.length > 0 ? (
                        <span className="h-6 w-px bg-[#d9e0da]" />
                      ) : null}
                    </span>
                    <span className="pb-3">
                      <span className="block text-xs font-semibold text-[#405049]">
                        Trigger
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] leading-4 text-[#74807a]">
                        {state.blueprint.trigger.label}
                      </span>
                    </span>
                  </li>
                  {allSteps.map((step, index) => (
                    <li key={step.id} className="flex gap-3">
                      <span className="flex flex-col items-center">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-full text-[0.65rem] font-semibold ${
                            step.kind === "policy_gate"
                              ? "bg-[#dcebe4] text-[#245641]"
                              : step.kind === "action"
                                ? "bg-[#f6e9d7] text-[#815c21]"
                                : "bg-[#eef1ee] text-[#5f6b66]"
                          }`}
                        >
                          {index + 2}
                        </span>
                        {index < allSteps.length - 1 ? (
                          <span className="h-6 w-px bg-[#d9e0da]" />
                        ) : null}
                      </span>
                      <span className="pb-3">
                        <span className="block text-xs font-semibold capitalize text-[#405049]">
                          {step.kind.replaceAll("_", " ")}
                        </span>
                        <span className="mt-0.5 block text-[0.7rem] leading-4 text-[#74807a]">
                          {step.kind === "policy_gate"
                            ? policyName(step.policyId)
                            : step.label}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <button
                type="button"
                onClick={() => setPreviewedAt(blueprintFingerprint)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#153d31] px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-[#102f26] active:scale-[0.98]"
              >
                <FlaskConical aria-hidden="true" className="h-4 w-4" />
                Run dry validation
              </button>

              <div aria-live="polite" className="mt-3 min-h-12">
                {previewedAt === blueprintFingerprint ? (
                  <div
                    className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs leading-5 ${
                      validation.publishable
                        ? "bg-[#edf6f1] text-[#2d604a]"
                        : "bg-[#fbecea] text-[#84362e]"
                    }`}
                  >
                    {validation.publishable ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                    ) : (
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                    )}
                    <span>
                      {validation.publishable
                        ? "This draft passes the current publish controls."
                        : `Publish would be refused by ${blocking.length} blocking control${blocking.length === 1 ? "" : "s"}.`}
                    </span>
                  </div>
                ) : (
                  <p className="text-center text-[0.7rem] leading-5 text-[#7a8580]">
                    Preview uses the same validation rules as publish feedback. The
                    server re-runs them before storing a published flow.
                  </p>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
