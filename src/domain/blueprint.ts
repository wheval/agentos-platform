import { z } from "zod";
import { ActionKindSchema, TimestampSchema } from "@/domain/schemas";

const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-z0-9][a-z0-9_-]*$`));

/**
 * The visual definition of an agent's job.
 *
 * A blueprint is the operator-facing artefact: it says what wakes the agent,
 * what the agent does, and — the part that makes this different from a generic
 * automation canvas — which policy bounds the authority before it acts. The
 * validator refuses to publish a flow where an action is not downstream of a
 * policy gate, so "an agent that can pay without a policy" is not a
 * configuration an operator can save by accident.
 *
 * A blueprint describes intent. It grants nothing on its own: authority is
 * still issued per request by the authority service, evaluated against the
 * live policy, and capped by the same short-lived capability grant.
 */

export const TriggerKindSchema = z.enum([
  /** Runs on a fixed cadence. */
  "schedule",
  /** Woken by an inbound call from a system the operator connected. */
  "webhook",
  /** Woken by another agent handing work over. */
  "handoff",
  /** Started by a human from the console. */
  "manual",
]);

export const BlueprintTriggerSchema = z
  .object({
    kind: TriggerKindSchema,
    /** Operator-facing label, e.g. "New invoice in the shared inbox". */
    label: z.string().min(3).max(120),
  })
  .strict();

/**
 * Work that carries no authority: reading, summarising, deciding what to
 * propose. Deliberately opaque to the control plane — AgentOS governs what an
 * agent may *do*, not how it thinks.
 */
const ReasoningStepSchema = z
  .object({
    kind: z.literal("step"),
    id: id("nd"),
    label: z.string().min(3).max(120),
    detail: z.string().max(400).optional(),
  })
  .strict();

/**
 * The authority boundary. Everything downstream of a gate is bounded by the
 * named policy; everything upstream of one is ungoverned and may not act.
 */
const PolicyGateSchema = z
  .object({
    kind: z.literal("policy_gate"),
    id: id("nd"),
    policyId: id("pol"),
  })
  .strict();

/** A request for real authority. Only legal downstream of a gate. */
const ActionStepSchema = z
  .object({
    kind: z.literal("action"),
    id: id("nd"),
    actionKind: ActionKindSchema,
    label: z.string().min(3).max(120),
  })
  .strict();

/** Tells a human something happened. Carries no authority. */
const NotifyStepSchema = z
  .object({
    kind: z.literal("notify"),
    id: id("nd"),
    audience: z.enum(["manager", "approvers", "requester"]),
    label: z.string().min(3).max(120),
  })
  .strict();

export const BlueprintStepSchema = z.discriminatedUnion("kind", [
  ReasoningStepSchema,
  PolicyGateSchema,
  ActionStepSchema,
  NotifyStepSchema,
]);

/**
 * The two ways a policy evaluation can come back when it has not denied
 * outright. Branch outcomes are drawn from the policy engine's own vocabulary
 * rather than free text, so a branch cannot describe a state the evaluator
 * never produces.
 */
export const BranchOutcomeSchema = z.enum(["auto_approved", "requires_approval"]);

export const BlueprintBranchSchema = z
  .object({
    id: id("br"),
    outcome: BranchOutcomeSchema,
    label: z.string().min(3).max(120),
    steps: z.array(BlueprintStepSchema),
  })
  .strict();

/**
 * A single terminal split, never nested.
 *
 * Nesting is refused on purpose: an authority flow an operator cannot read top
 * to bottom in one pass is an authority flow nobody audits. One split covers
 * the case that actually occurs — the policy either cleared the action or it
 * needs a human — and keeps every path enumerable at a glance.
 */
export const BlueprintBranchingSchema = z
  .object({
    id: id("nd"),
    label: z.string().min(3).max(120),
    branches: z.array(BlueprintBranchSchema).min(2).max(4),
  })
  .strict();

export const AgentBlueprintSchema = z
  .object({
    id: id("bp"),
    organizationId: id("org"),
    name: z.string().min(3).max(120),
    summary: z.string().min(10).max(400),
    /** The agent this flow describes. Unassigned drafts are allowed. */
    agentId: id("agt").nullable(),
    status: z.enum(["draft", "published"]),
    /**
     * Exactly one trigger, always first. Modelled as its own field rather than
     * a node in the list so the invariant is carried by the type instead of
     * being re-checked everywhere something walks the flow.
     */
    trigger: BlueprintTriggerSchema,
    steps: z.array(BlueprintStepSchema),
    branching: BlueprintBranchingSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export type TriggerKind = z.infer<typeof TriggerKindSchema>;
export type BlueprintTrigger = z.infer<typeof BlueprintTriggerSchema>;
export type BlueprintStep = z.infer<typeof BlueprintStepSchema>;
export type BlueprintStepKind = BlueprintStep["kind"];
export type BranchOutcome = z.infer<typeof BranchOutcomeSchema>;
export type BlueprintBranch = z.infer<typeof BlueprintBranchSchema>;
export type BlueprintBranching = z.infer<typeof BlueprintBranchingSchema>;
export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;
