"use client";

import type { ReactNode } from "react";
import type {
  AgentBlueprint,
  BlueprintBranch,
  BlueprintStep,
} from "@/domain/blueprint";
import type { BlueprintIssue } from "@/application/blueprint-validation";

/**
 * Renders a blueprint as a vertical flow.
 *
 * Laid out with CSS rather than a canvas library. The shape a blueprint can
 * take is fixed — one trigger, a linear spine, at most one terminal split — so
 * a free-form canvas would buy dragging nobody needs at the cost of keyboard
 * access and server rendering. Every node here is a real button, reachable by
 * tab, and the whole flow reads top to bottom for a screen reader.
 */

type NodeVisual = {
  icon: ReactNode;
  kindLabel: string;
  title: string;
  detail?: string;
};

const ICON_CLASS = "h-4 w-4";

function TriggerIcon() {
  return (
    <svg
      className={ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M11 2 4 11h5l-1 7 7-9h-5l1-7Z" strokeLinejoin="round" />
    </svg>
  );
}

function StepIcon() {
  return (
    <svg
      className={ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v4l2.5 1.5" strokeLinecap="round" />
    </svg>
  );
}

function GateIcon() {
  return (
    <svg
      className={ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M10 2.5 4 5v4.5c0 3.4 2.4 6.4 6 8 3.6-1.6 6-4.6 6-8V5l-6-2.5Z" strokeLinejoin="round" />
      <path d="M7.5 10l1.8 1.8L13 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PathsIcon() {
  return (
    <svg
      className={ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M10 3v5M10 8c0 2-4 2-4 4v3M10 8c0 2 4 2 4 4v3" strokeLinecap="round" />
    </svg>
  );
}

function ActionIcon() {
  return (
    <svg
      className={ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="2.5" y="5" width="15" height="10" rx="2" />
      <path d="M2.5 8.5h15" />
    </svg>
  );
}

function NotifyIcon() {
  return (
    <svg
      className={ICON_CLASS}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M10 3a4 4 0 0 0-4 4v3l-1.5 2.5h11L14 10V7a4 4 0 0 0-4-4Z" strokeLinejoin="round" />
      <path d="M8.5 15a1.5 1.5 0 0 0 3 0" strokeLinecap="round" />
    </svg>
  );
}

function stepVisual(step: BlueprintStep, policyName: (id: string) => string): NodeVisual {
  switch (step.kind) {
    case "step":
      return {
        icon: <StepIcon />,
        kindLabel: "Step",
        title: step.label,
        ...(step.detail === undefined ? {} : { detail: step.detail }),
      };
    case "policy_gate":
      return {
        icon: <GateIcon />,
        kindLabel: "Policy gate",
        title: policyName(step.policyId),
        detail: "Everything below this gate is bounded by this policy.",
      };
    case "action":
      return {
        icon: <ActionIcon />,
        kindLabel: "Action",
        title: step.label,
        detail: step.actionKind.replace(/_/g, " "),
      };
    case "notify":
      return {
        icon: <NotifyIcon />,
        kindLabel: "Notify",
        title: step.label,
        detail: `Sent to the ${step.audience}`,
      };
  }
}

function Connector() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <span className="h-6 w-px border-l border-dashed border-[#c8d0ca]" />
    </div>
  );
}

/** Splits the spine into one dashed drop per branch. */
function BranchFan({ count }: { count: number }) {
  return (
    <div className="flex h-6" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-1 basis-0 justify-center">
          <span className="w-px border-l border-dashed border-[#c8d0ca]" />
        </div>
      ))}
    </div>
  );
}

function InsertButton({ onInsert, label }: { onInsert: () => void; label: string }) {
  return (
    <div className="relative flex h-8 items-center justify-center">
      <span
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-[#c8d0ca]"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onInsert}
        title={label}
        className="relative flex h-6 w-6 items-center justify-center rounded-full border border-[#dde2dc] bg-white text-[#48544f] transition hover:border-[#2f6b55] hover:text-[#2f6b55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6b55]"
      >
        <span className="sr-only">{label}</span>
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function NodeCard({
  index,
  visual,
  selected,
  issue,
  onSelect,
  tone = "light",
}: {
  index?: number;
  visual: NodeVisual;
  selected: boolean;
  issue?: BlueprintIssue;
  onSelect?: () => void;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const blocking = issue?.severity === "blocking";

  const border = blocking
    ? "border-[#b4453c]"
    : selected
      ? "border-[#2f6b55]"
      : dark
        ? "border-[#14231f]"
        : "border-[#dde2dc]";

  const ring = selected ? "ring-2 ring-[#2f6b55]/20" : "";

  const content = (
    <>
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          blocking
            ? "bg-[#fbeceb] text-[#b4453c]"
            : dark
              ? "bg-white/10 text-[#8fd3b6]"
              : "bg-[#eef1ee] text-[#2f6b55]"
        }`}
      >
        {visual.icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-baseline gap-2">
          {index === undefined ? null : (
            <span className="text-xs font-medium tabular-nums text-[#66736e]">{index}.</span>
          )}
          <span
            className={`text-xs font-medium uppercase tracking-wide ${dark ? "text-[#9db3aa]" : "text-[#66736e]"}`}
          >
            {visual.kindLabel}
          </span>
        </span>
        <span
          className={`mt-0.5 block truncate text-sm font-medium ${dark ? "text-white" : "text-[#14231f]"}`}
        >
          {visual.title}
        </span>
        {visual.detail ? (
          <span
            className={`mt-0.5 block truncate text-xs ${dark ? "text-[#9db3aa]" : "text-[#66736e]"}`}
          >
            {visual.detail}
          </span>
        ) : null}
        {issue ? (
          <span
            className={`mt-1.5 block text-xs ${blocking ? "text-[#b4453c]" : "text-[#8a6d3b]"}`}
          >
            {issue.message}
          </span>
        ) : null}
      </span>
    </>
  );

  const className = `flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-[0_1px_2px_rgba(20,35,31,0.04)] ${
    dark ? "bg-[#14231f]" : "bg-white"
  } ${border} ${ring}`;

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`${className} transition hover:border-[#2f6b55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6b55]`}
    >
      {content}
    </button>
  );
}

export type FlowCanvasProps = {
  blueprint: AgentBlueprint;
  issues: BlueprintIssue[];
  policyName: (id: string) => string;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  /** Called with the spine index to insert at, or a branch id plus index. */
  onInsertStep?: (target: { branchId: string | null; index: number }) => void;
};

export function FlowCanvas({
  blueprint,
  issues,
  policyName,
  selectedNodeId = null,
  onSelectNode,
  onInsertStep,
}: FlowCanvasProps) {
  const issueFor = (nodeId: string) =>
    issues.find((issue) => issue.nodeId === nodeId);

  // Numbering runs down the spine and restarts inside each branch, which is how
  // an operator describes a flow out loud: "step three, then on the approval
  // path, step one".
  const insert = (branchId: string | null, index: number) => () =>
    onInsertStep?.({ branchId, index });

  const renderStep = (step: BlueprintStep, index: number) => {
    const props: Parameters<typeof NodeCard>[0] = {
      index,
      visual: stepVisual(step, policyName),
      selected: selectedNodeId === step.id,
      ...(onSelectNode ? { onSelect: () => onSelectNode(step.id) } : {}),
    };

    const issue = issueFor(step.id);

    return <NodeCard key={step.id} {...props} {...(issue ? { issue } : {})} />;
  };

  const renderBranch = (branch: BlueprintBranch) => (
    <div key={branch.id} className="flex-1 basis-0">
      <div className="rounded-t-xl border border-b-0 border-[#dde2dc] bg-[#f6f8f6] px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[#66736e]">
          {branch.outcome === "auto_approved" ? "Auto-approved" : "Needs approval"}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-[#14231f]">{branch.label}</p>
      </div>
      <div className="rounded-b-xl border border-t-0 border-[#dde2dc] bg-white/60 p-3">
        {branch.steps.length === 0 ? (
          <p className="py-2 text-center text-xs text-[#66736e]">Nothing on this path yet.</p>
        ) : (
          branch.steps.map((step, index) => (
            <div key={step.id}>
              {index === 0 ? null : <Connector />}
              {renderStep(step, index + 1)}
            </div>
          ))
        )}
        {onInsertStep ? (
          <div className="mt-1">
            <InsertButton
              onInsert={insert(branch.id, branch.steps.length)}
              label={`Add a step to the ${branch.label} path`}
            />
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <NodeCard
        visual={{
          icon: <TriggerIcon />,
          kindLabel: "Trigger",
          title: blueprint.trigger.label,
          detail: `Started by ${blueprint.trigger.kind.replace(/_/g, " ")}`,
        }}
        selected={selectedNodeId === "trigger"}
        {...(onSelectNode ? { onSelect: () => onSelectNode("trigger") } : {})}
      />

      {blueprint.steps.map((step, index) => {
        return (
          <div key={step.id}>
            {onInsertStep ? (
              <div>
                <InsertButton onInsert={insert(null, index)} label="Add a step here" />
              </div>
            ) : (
              <Connector />
            )}
            {renderStep(step, index + 1)}
          </div>
        );
      })}

      {onInsertStep ? (
        <InsertButton
          onInsert={insert(null, blueprint.steps.length)}
          label="Add a step to the end"
        />
      ) : (
        <Connector />
      )}

      {blueprint.branching ? (
        <>
          <NodeCard
            visual={{
              icon: <PathsIcon />,
              kindLabel: "Paths",
              title: blueprint.branching.label,
              detail: `${blueprint.branching.branches.length} outcomes`,
            }}
            tone="dark"
            selected={selectedNodeId === blueprint.branching.id}
            {...(issueFor(blueprint.branching.id)
              ? { issue: issueFor(blueprint.branching.id) as BlueprintIssue }
              : {})}
            {...(onSelectNode && blueprint.branching
              ? { onSelect: () => onSelectNode(blueprint.branching!.id) }
              : {})}
          />
          <BranchFan count={blueprint.branching.branches.length} />
          <div className="flex gap-3">{blueprint.branching.branches.map(renderBranch)}</div>
        </>
      ) : null}
    </div>
  );
}
