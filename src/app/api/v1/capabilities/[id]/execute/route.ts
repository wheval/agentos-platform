import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, problem, readJsonBody } from "@/lib/api";
import { getWorkspace } from "@/lib/workspace";

const BodySchema = z
  .object({
    /**
     * Supplied by the caller so a retry after a network timeout is provably the
     * same attempt. Without it an agent that never sees a response has no safe
     * way to retry a payment.
     */
    idempotencyKey: z.string().min(8).max(120),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = BodySchema.safeParse(json.body);

  if (!parsed.success) {
    return problem(
      422,
      "VALIDATION_FAILED",
      "idempotencyKey must be between 8 and 120 characters",
    );
  }

  const { id } = await context.params;
  const workspace = getWorkspace();
  const agent = await workspace.store.getAgent(auth.agent.agentId);

  if (!agent) return problem(404, "AGENT_NOT_FOUND", "Unknown agent");

  const result = await workspace.authority.executeCapability({
    capabilityId: id,
    agentId: agent.id,
    idempotencyKey: parsed.data.idempotencyKey,
    actor: { type: "agent", id: agent.id, displayName: agent.name },
  });

  if (!result.ok) return errorResponse(result.error);

  return NextResponse.json({
    receipt: result.value.receipt,
    request: result.value.request,
  });
}
