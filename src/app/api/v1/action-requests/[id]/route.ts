import { NextResponse } from "next/server";
import { authenticateRequest, problem } from "@/lib/api";
import { getWorkspace } from "@/lib/workspace";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const workspace = getWorkspace();
  const actionRequest = await workspace.store.getActionRequest(id);

  // An agent may only read its own requests. Returning 404 rather than 403 for
  // someone else's request avoids confirming that the id exists at all.
  if (!actionRequest || actionRequest.agentId !== auth.agent.agentId) {
    return problem(404, "REQUEST_NOT_FOUND", "Unknown action request");
  }

  const capabilities = await workspace.store.listCapabilities();
  const approvals = await workspace.store.listApprovalsForRequest(id);

  return NextResponse.json({
    request: actionRequest,
    approvals,
    capabilities: capabilities.filter((grant) => grant.actionRequestId === id),
  });
}
