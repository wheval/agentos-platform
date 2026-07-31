import { NextResponse } from "next/server";
import { authenticateRequest, errorResponse, problem } from "@/lib/api";
import { getWorkspace } from "@/lib/workspace";

/**
 * Claims the capability for an approved request.
 *
 * Issuance is a deliberate second step rather than something that happens
 * automatically at approval. A capability is short-lived — 300 seconds under the
 * seeded policies — so minting it at approval time would burn most of its life
 * while the agent is still waiting on a human. Letting the agent claim it when
 * it is ready to act means the whole TTL is usable.
 *
 * Claiming is safe to retry: the service mints exactly once, and a repeat claim
 * returns the grant that already exists.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const workspace = getWorkspace();
  const actionRequest = await workspace.store.getActionRequest(id);

  // Same reasoning as the read route: a request belonging to another agent is
  // reported as missing rather than forbidden, so ids cannot be probed.
  if (!actionRequest || actionRequest.agentId !== auth.agent.agentId) {
    return problem(404, "REQUEST_NOT_FOUND", "Unknown action request");
  }

  const agent = await workspace.store.getAgent(auth.agent.agentId);
  if (!agent) return problem(404, "AGENT_NOT_FOUND", "Unknown agent");

  // An agent that never saw the first response must be able to retry. Returning
  // the grant it already owns is a read, not a second mint, so the service's
  // "issue exactly once" invariant is untouched — the agent just stops being
  // punished for a dropped connection.
  const existing = (await workspace.store.listCapabilities()).find(
    (grant) => grant.actionRequestId === id,
  );

  if (existing) {
    return NextResponse.json({ capability: existing, request: actionRequest });
  }

  const result = await workspace.authority.issueCapability({
    actionRequestId: id,
    actor: { type: "agent", id: agent.id, displayName: agent.name },
  });

  if (!result.ok) return errorResponse(result.error);

  return NextResponse.json({
    capability: result.value.capability,
    request: result.value.request,
  });
}
