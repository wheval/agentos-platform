import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api";
import { getWorkspace } from "@/lib/workspace";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const workspace = getWorkspace();
  const capabilities = await workspace.store.listCapabilities();

  return NextResponse.json({
    capabilities: capabilities.filter(
      (grant) => grant.issuedToAgentId === auth.agent.agentId,
    ),
  });
}
