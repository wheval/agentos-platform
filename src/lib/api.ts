import { NextResponse } from "next/server";
import type { AuthorityError } from "@/application/authority-service";
import { getWorkspace } from "@/lib/workspace";

/**
 * Shared plumbing for the agent-facing API.
 *
 * Agents authenticate with a per-agent key rather than an operator session, so
 * a compromised agent can only ever act as itself, and revoking one key does
 * not disturb the rest of the fleet.
 */

const STATUS_BY_CODE: Record<AuthorityError["code"], number> = {
  AGENT_NOT_FOUND: 404,
  POLICY_NOT_FOUND: 404,
  REQUEST_NOT_FOUND: 404,
  CAPABILITY_NOT_FOUND: 404,
  APPROVER_NOT_AUTHORIZED: 403,
  INVALID_STATE: 409,
  CAPABILITY_DENIED: 403,
  VALIDATION_FAILED: 422,
};

export function errorResponse(error: AuthorityError): NextResponse {
  return NextResponse.json(
    { error: { code: error.code, message: error.message, ...(error.details ?? {}) } },
    { status: STATUS_BY_CODE[error.code] ?? 400 },
  );
}

export function problem(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export type AuthenticatedAgent = { agentId: string; apiKeyId: string };

export async function authenticateRequest(
  request: Request,
): Promise<
  { ok: true; agent: AuthenticatedAgent } | { ok: false; response: NextResponse }
> {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: problem(
        401,
        "MISSING_CREDENTIAL",
        "Provide an agent API key as `Authorization: Bearer aos_sk_...`",
      ),
    };
  }

  const result = await getWorkspace().authority.authenticateAgent(header.slice(7));

  if (!result.ok) {
    return {
      ok: false,
      response: problem(401, "INVALID_CREDENTIAL", result.error.message),
    };
  }

  return {
    ok: true,
    agent: { agentId: result.value.agentId, apiKeyId: result.value.apiKey.id },
  };
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: problem(400, "INVALID_JSON", "Request body must be valid JSON"),
    };
  }
}
