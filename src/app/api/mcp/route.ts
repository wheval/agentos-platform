import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/api";
import { getWorkspace } from "@/lib/workspace";

/**
 * Model Context Protocol endpoint.
 *
 * The lesson from every agent-payments product shipped so far is that the
 * connect surface for a model has to be one URL. This is that URL: a JSON-RPC
 * 2.0 handler speaking MCP over HTTP POST, exposing the same four operations as
 * the REST API and enforcing exactly the same authority rules, because both go
 * through `AuthorityService`.
 *
 * Authentication is the agent's own API key on the `Authorization` header.
 * OAuth-based client registration is the natural next step and is not
 * implemented here.
 */

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "list_capabilities",
    description:
      "List the capability grants currently issued to this agent, including scope, remaining uses and expiry.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "request_payment",
    description:
      "Ask for authority to make one payment. Returns a decision: approved, awaiting human approval, or denied with reasons. No money moves and no credential is returned.",
    inputSchema: {
      type: "object",
      properties: {
        policyId: { type: "string", description: "Policy to evaluate against." },
        amountMinor: {
          type: "integer",
          description: "Amount in minor units, e.g. 4500 for $45.00.",
        },
        currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
        counterpartyId: { type: "string" },
        counterpartyName: { type: "string" },
        resource: {
          type: "string",
          description: "What is being paid for, e.g. vendor:acme/subscription.",
        },
        reference: {
          type: "string",
          description: "Invoice, order or contract reference the approver can look up.",
        },
        context: {
          type: "string",
          description:
            "Why this payment is needed, in plain language. A human approver reads this.",
        },
      },
      required: [
        "policyId",
        "amountMinor",
        "currency",
        "counterpartyId",
        "counterpartyName",
        "resource",
        "reference",
        "context",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "check_action_request",
    description:
      "Check the current state of an action request, including any capability that has been issued for it.",
    inputSchema: {
      type: "object",
      properties: { actionRequestId: { type: "string" } },
      required: ["actionRequestId"],
      additionalProperties: false,
    },
  },
  {
    name: "claim_capability",
    description:
      "Claim the scoped capability for an approved action request. Call this when you are ready to act: the grant is short-lived, so claiming late leaves you the full window. Returns the grant's bounds, never a raw credential.",
    inputSchema: {
      type: "object",
      properties: { actionRequestId: { type: "string" } },
      required: ["actionRequestId"],
      additionalProperties: false,
    },
  },
  {
    name: "execute_capability",
    description:
      "Redeem a capability grant exactly once. Supply a stable idempotency key so retries are safe.",
    inputSchema: {
      type: "object",
      properties: {
        capabilityId: { type: "string" },
        idempotencyKey: { type: "string", minLength: 8 },
      },
      required: ["capabilityId", "idempotencyKey"],
      additionalProperties: false,
    },
  },
] as const;

const RequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const PaymentArgsSchema = z.object({
  policyId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.enum(["USD", "EUR", "GBP"]),
  counterpartyId: z.string().min(1),
  counterpartyName: z.string().min(1),
  resource: z.string().min(1),
  reference: z.string().min(1).max(140),
  context: z.string().min(12).max(500),
});

type JsonRpcId = string | number | null;

function ok(id: JsonRpcId, result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function fail(id: JsonRpcId, code: number, message: string): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/** MCP tool results are content blocks; JSON is returned as pretty text. */
function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const parsedBody = RequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return fail(null, -32700, "Parse error");
  }

  const { id = null, method, params = {} } = parsedBody.data;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "agentos", version: "0.1.0" },
      instructions:
        "AgentOS grants scoped, revocable authority. Ask for authority with request_payment, then redeem the resulting capability. You will never receive a raw credential.",
    });
  }

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 202 });
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method !== "tools/call") {
    return fail(id, -32601, `Unknown method: ${method}`);
  }

  // Authentication is deferred to here so `initialize` and `tools/list` can be
  // used for discovery, while anything that touches authority cannot.
  const auth = await authenticateRequest(request);

  if (!auth.ok) {
    return fail(id, -32001, "Invalid or missing agent API key");
  }

  const name = typeof params.name === "string" ? params.name : "";
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const workspace = getWorkspace();
  const agent = await workspace.store.getAgent(auth.agent.agentId);

  if (!agent) return fail(id, -32001, "Unknown agent");

  const actor = { type: "agent" as const, id: agent.id, displayName: agent.name };

  if (name === "list_capabilities") {
    const capabilities = await workspace.store.listCapabilities();

    return ok(
      id,
      toolResult({
        capabilities: capabilities.filter(
          (grant) => grant.issuedToAgentId === agent.id,
        ),
      }),
    );
  }

  if (name === "request_payment") {
    const parsed = PaymentArgsSchema.safeParse(args);

    if (!parsed.success) {
      return ok(id, toolResult({ error: parsed.error.issues }, true));
    }

    const { policyId, ...input } = parsed.data;
    const result = await workspace.authority.submitActionRequest({
      agentId: agent.id,
      policyId,
      input: { ...input },
      actor,
    });

    return result.ok
      ? ok(
          id,
          toolResult({
            actionRequestId: result.value.request.id,
            state: result.value.request.state,
            decision: result.value.request.policyEvaluation,
          }),
        )
      : ok(id, toolResult({ error: result.error }, true));
  }

  if (name === "check_action_request") {
    const actionRequestId =
      typeof args.actionRequestId === "string" ? args.actionRequestId : "";
    const actionRequest = await workspace.store.getActionRequest(actionRequestId);

    if (!actionRequest || actionRequest.agentId !== agent.id) {
      return ok(id, toolResult({ error: "Unknown action request" }, true));
    }

    const capabilities = await workspace.store.listCapabilities();

    return ok(
      id,
      toolResult({
        state: actionRequest.state,
        decision: actionRequest.policyEvaluation,
        capabilities: capabilities.filter(
          (grant) => grant.actionRequestId === actionRequest.id,
        ),
      }),
    );
  }

  if (name === "claim_capability") {
    const actionRequestId =
      typeof args.actionRequestId === "string" ? args.actionRequestId : "";
    const actionRequest = await workspace.store.getActionRequest(actionRequestId);

    if (!actionRequest || actionRequest.agentId !== agent.id) {
      return ok(id, toolResult({ error: "Unknown action request" }, true));
    }

    // Retry-safe for the same reason as the REST route: returning the grant the
    // agent already owns is a read, not a second mint.
    const existing = (await workspace.store.listCapabilities()).find(
      (grant) => grant.actionRequestId === actionRequestId,
    );

    if (existing) {
      return ok(
        id,
        toolResult({ capability: existing, state: actionRequest.state }),
      );
    }

    const result = await workspace.authority.issueCapability({
      actionRequestId,
      actor,
    });

    return result.ok
      ? ok(
          id,
          toolResult({
            capability: result.value.capability,
            state: result.value.request.state,
          }),
        )
      : ok(id, toolResult({ error: result.error }, true));
  }

  if (name === "execute_capability") {
    const capabilityId =
      typeof args.capabilityId === "string" ? args.capabilityId : "";
    const idempotencyKey =
      typeof args.idempotencyKey === "string" ? args.idempotencyKey : "";

    const result = await workspace.authority.executeCapability({
      capabilityId,
      agentId: agent.id,
      idempotencyKey,
      actor,
    });

    return result.ok
      ? ok(
          id,
          toolResult({
            receipt: result.value.receipt,
            state: result.value.request.state,
          }),
        )
      : ok(id, toolResult({ error: result.error }, true));
  }

  return fail(id, -32602, `Unknown tool: ${name}`);
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    name: "agentos",
    protocolVersion: PROTOCOL_VERSION,
    transport: "http-json-rpc",
    tools: TOOLS.map((tool) => tool.name),
    authentication: "Authorization: Bearer <agent api key>",
  });
}
