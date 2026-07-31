import {
  ActionKindSchema,
  CapabilityGrantSchema,
  CurrencySchema,
  type CapabilityGrant,
} from "@/domain/schemas";
import { z } from "zod";

const CapabilityUseAttemptSchema = z
  .object({
    agentId: z.string().min(1),
    actionRequestId: z.string().min(1),
    actionKind: ActionKindSchema,
    resource: z.string().min(1),
    amountMinor: z.number().int().positive(),
    currency: CurrencySchema,
    counterpartyId: z.string().min(1),
  })
  .strict();

export type CapabilityUseAttempt = z.infer<typeof CapabilityUseAttemptSchema>;

export type CapabilityAuthorization =
  | { authorized: true; reasons: [] }
  | { authorized: false; reasons: string[] };

export function authorizeCapabilityUse(
  capabilityInput: CapabilityGrant,
  attemptInput: CapabilityUseAttempt,
  nowInput: string,
): CapabilityAuthorization {
  const capability = CapabilityGrantSchema.parse(capabilityInput);
  const attempt = CapabilityUseAttemptSchema.parse(attemptInput);
  const now = new Date(nowInput);
  const reasons: string[] = [];

  if (capability.status !== "active") reasons.push("CAPABILITY_NOT_ACTIVE");
  if (now < new Date(capability.issuedAt)) reasons.push("CAPABILITY_NOT_YET_VALID");
  if (now >= new Date(capability.expiresAt)) reasons.push("CAPABILITY_EXPIRED");
  if (attempt.agentId !== capability.issuedToAgentId) {
    reasons.push("AGENT_SCOPE_MISMATCH");
  }
  if (attempt.actionRequestId !== capability.actionRequestId) {
    reasons.push("REQUEST_SCOPE_MISMATCH");
  }
  if (attempt.actionKind !== capability.scope.actionKind) {
    reasons.push("ACTION_SCOPE_MISMATCH");
  }
  if (attempt.resource !== capability.scope.resource) {
    reasons.push("RESOURCE_SCOPE_MISMATCH");
  }
  if (attempt.amountMinor > capability.scope.amountLimitMinor) {
    reasons.push("AMOUNT_SCOPE_EXCEEDED");
  }
  if (attempt.currency !== capability.scope.currency) {
    reasons.push("CURRENCY_SCOPE_MISMATCH");
  }
  if (attempt.counterpartyId !== capability.scope.counterpartyId) {
    reasons.push("COUNTERPARTY_SCOPE_MISMATCH");
  }

  return reasons.length === 0
    ? { authorized: true, reasons: [] }
    : { authorized: false, reasons };
}
