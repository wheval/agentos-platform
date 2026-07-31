"use client";

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
  saveAction,
}: {
  initialBlueprint: AgentBlueprint;
  policies: Policy[];
  agents: Agent[];
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

  const validation = useMemo(
    () => validateBlueprint({ blueprint: state.blueprint, policies, agents }),
    [state.blueprint, policies, agents],
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {blocking.length > 0 ? (
          <div
            role="status"
            className="rounded-xl border border-[#e6c9c6] bg-[#fbeceb] p-4 text-sm text-[#7f2f28]"
          >
            <p className="font-medium">
              {blocking.length === 1
                ? "One thing blocks publishing"
                : `${blocking.length} things block publishing`}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {blocking.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div
            role="status"
            className="rounded-xl border border-[#c9ded2] bg-[#eff6f2] p-4 text-sm text-[#1f4c3d]"
          >
            <p className="font-medium">Every action in this flow is behind a policy gate.</p>
            {warnings.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[#48544f]">
                {warnings.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="rounded-2xl border border-[#dde2dc] bg-[#f9faf9] p-6">
          <FlowCanvas
            blueprint={state.blueprint}
            issues={validation.issues}
            policyName={policyName}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={(nodeId) => dispatch({ type: "select", nodeId })}
            onInsertStep={setInsertTarget}
          />
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border border-[#dde2dc] bg-white p-4">
          <h2 className="text-sm font-semibold text-[#14231f]">Flow</h2>
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
                  dispatch({ type: "assign", agentId: event.target.value || null })
                }
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="blueprint-trigger">
                Trigger
              </label>
              <input
                id="blueprint-trigger"
                className={`${FIELD_CLASS} mt-1`}
                value={state.blueprint.trigger.label}
                onChange={(event) => dispatch({ type: "trigger", label: event.target.value })}
              />
            </div>
          </div>
        </section>

        {insertTarget ? (
          <section className="rounded-xl border border-[#2f6b55] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#14231f]">Add a node</h2>
            <div className="mt-3 space-y-2">
              {STEP_CHOICES.map((choice) => (
                <button
                  key={choice.kind}
                  type="button"
                  onClick={() => {
                    dispatch({ type: "insert", ...insertTarget, kind: choice.kind });
                    setInsertTarget(null);
                  }}
                  className="block w-full rounded-lg border border-[#dde2dc] px-3 py-2 text-left transition hover:border-[#2f6b55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6b55]"
                >
                  <span className="block text-sm font-medium text-[#14231f]">{choice.label}</span>
                  <span className="block text-xs text-[#66736e]">{choice.hint}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setInsertTarget(null)}
              className="mt-3 text-xs text-[#48544f] underline underline-offset-2"
            >
              Cancel
            </button>
          </section>
        ) : null}

        {selected ? (
          <section className="rounded-xl border border-[#dde2dc] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#14231f]">Configure node</h2>
            <div className="mt-3 space-y-3">
              {selected.kind === "policy_gate" ? (
                <div>
                  <label className={LABEL_CLASS} htmlFor="node-policy">
                    Policy
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
                        {policy.status === "active" ? "" : ` (${policy.status})`}
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
                onClick={() => dispatch({ type: "remove", nodeId: selected.id })}
                className="text-xs text-[#b4453c] underline underline-offset-2"
              >
                Remove this node
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-[#dde2dc] bg-white p-4">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending || !validation.publishable}
              onClick={() => void save(true)}
              className="rounded-lg bg-[#2f6b55] px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6b55]"
            >
              {pending ? "Saving…" : "Publish"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void save(false)}
              className="rounded-lg border border-[#dde2dc] px-4 py-2 text-sm font-medium text-[#14231f] transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6b55]"
            >
              Save draft
            </button>
          </div>
          {!validation.publishable ? (
            <p className="mt-2 text-xs text-[#66736e]">
              Publishing stays disabled until every action sits behind a policy gate.
            </p>
          ) : null}
          <p aria-live="polite" className="mt-2 text-xs">
            {result.error ? (
              <span className="text-[#b4453c]">{result.error}</span>
            ) : result.message ? (
              <span className="text-[#2f6b55]">{result.message}</span>
            ) : null}
          </p>
        </section>
      </div>
    </div>
  );
}
