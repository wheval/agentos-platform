import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, errorResponse, problem, readJsonBody } from "@/lib/api";
import { getWorkspace } from "@/lib/workspace";

const BodySchema = z
  .object({
    policyId: z.string().min(1),
    amountMinor: z.number().int().positive(),
    currency: z.enum(["USD", "EUR", "GBP"]),
    counterpartyId: z.string().min(1),
    counterpartyName: z.string().min(1),
    resource: z.string().min(1),
    reference: z.string().min(1).max(140),
    /**
     * Required, and required to be substantial. An approver who cannot tell why
     * an agent wants to spend money cannot meaningfully approve it, so a
     * request without a reason is rejected rather than accepted with a blank.
     */
    context: z.string().min(12).max(500),
  })
  .strict();

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;

  const parsed = BodySchema.safeParse(json.body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request body failed validation",
          issues: parsed.error.issues,
        },
      },
      { status: 422 },
    );
  }

  const { policyId, ...input } = parsed.data;
  const workspace = getWorkspace();
  const agent = await workspace.store.getAgent(auth.agent.agentId);

  if (!agent) return problem(404, "AGENT_NOT_FOUND", "Unknown agent");

  const result = await workspace.authority.submitActionRequest({
    agentId: agent.id,
    policyId,
    input: { ...input },
    actor: { type: "agent", id: agent.id, displayName: agent.name },
  });

  if (!result.ok) return errorResponse(result.error);

  return NextResponse.json({ request: result.value.request }, { status: 201 });
}
