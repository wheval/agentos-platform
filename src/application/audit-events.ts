import {
  AuditEventSchema,
  type Actor,
  type AuditEvent,
} from "@/domain/schemas";

export function createAuditEvent(input: {
  id: string;
  organizationId: string;
  actionRequestId?: string;
  actor: Actor;
  eventType: AuditEvent["eventType"];
  outcome: AuditEvent["outcome"];
  summary: string;
  metadata?: AuditEvent["metadata"];
  occurredAt: string;
}): AuditEvent {
  return AuditEventSchema.parse({
    ...input,
    metadata: input.metadata ?? {},
  });
}
