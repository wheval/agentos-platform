import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Docs",
  description: "Connect an agent to AgentOS over MCP or the REST API.",
};

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#22332d] bg-[#14231f]">
      <div className="border-b border-[#2a3d36] px-4 py-2">
        <span className="font-mono text-xs text-[#8fae9f]">{label}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 text-[0.78rem] leading-relaxed text-[#d6e2db]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-[#14231f] sm:text-4xl">
        Connect an agent
      </h1>
      <p className="mt-4 text-lg text-[#48544f]">
        Agents authenticate with their own API key. Every surface — MCP and REST
        alike — runs the same authority service, so neither can be used to
        bypass the other.
      </p>

      <section className="mt-12 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-[#14231f]">
          1. Get the agent&rsquo;s key
        </h2>
        <p className="text-[#48544f]">
          Demo keys are generated when the server boots and shown once, in
          Console → Settings. They are never written to disk or to the
          repository. Restarting the server issues new ones.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-[#14231f]">
          2. Point the model at the MCP endpoint
        </h2>
        <p className="text-[#48544f]">
          One URL, four tools:{" "}
          <code className="font-mono text-sm">list_capabilities</code>,{" "}
          <code className="font-mono text-sm">request_payment</code>,{" "}
          <code className="font-mono text-sm">check_action_request</code>,{" "}
          <code className="font-mono text-sm">claim_capability</code>,{" "}
          <code className="font-mono text-sm">execute_capability</code>.
        </p>
        <CodeBlock
          label="mcp client config"
          code={`{
  "mcpServers": {
    "agentos": {
      "url": "https://your-deployment/api/mcp",
      "headers": { "Authorization": "Bearer aos_sk_..." }
    }
  }
}`}
        />
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-[#14231f]">
          3. Ask for authority
        </h2>
        <p className="text-[#48544f]">
          The response is a decision, not a credential.{" "}
          <code className="font-mono text-sm">approved</code> means a capability
          can be issued; <code className="font-mono text-sm">pending_approval</code>{" "}
          means a human is now looking at the context the agent supplied.
        </p>
        <CodeBlock
          label="POST /api/v1/action-requests"
          code={`curl -X POST https://your-deployment/api/v1/action-requests \\
  -H "Authorization: Bearer $AGENTOS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "policyId": "pol_vendor_invoice",
    "amountMinor": 45000,
    "currency": "USD",
    "counterpartyId": "cpty_acme",
    "counterpartyName": "Acme Cloud",
    "resource": "vendor:acme/invoice",
    "reference": "INV-2291",
    "context": "October hosting invoice, matches the signed contract."
  }'`}
        />
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-[#14231f]">
          4. Claim the capability
        </h2>
        <p className="text-[#48544f]">
          Claim it when you are ready to act, not the moment it is approved. A
          grant is short-lived — 300 seconds under the seeded policies — so
          claiming early burns the window while nothing is happening. Claiming
          twice returns the same grant rather than minting a second one. What
          comes back describes the bounds of the authority, never a credential.
        </p>
        <CodeBlock
          label="POST /api/v1/action-requests/:id/capability"
          code={`curl -X POST https://your-deployment/api/v1/action-requests/req_.../capability \\
  -H "Authorization: ******"`}
        />
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-[#14231f]">
          5. Redeem the capability
        </h2>
        <p className="text-[#48544f]">
          Supply a stable idempotency key. A retry with the same key returns the
          original receipt instead of paying twice — which matters most exactly
          when the agent never saw the first response. Keys are scoped to your
          agent, so you never collide with another agent&apos;s key and never see
          another agent&apos;s receipt.
        </p>
        <CodeBlock
          label="POST /api/v1/capabilities/:id/execute"
          code={`curl -X POST https://your-deployment/api/v1/capabilities/cap_.../execute \\
  -H "Authorization: Bearer $AGENTOS_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "idempotencyKey": "invoice-2291-attempt-1" }'`}
        />
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-[#14231f]">
          Errors worth handling
        </h2>
        <dl className="mt-4 divide-y divide-[#eef1ee] rounded-2xl border border-[#dde2dc] bg-white">
          {[
            [
              "401 INVALID_CREDENTIAL",
              "The key is unknown or revoked. Rejections are recorded in the audit ledger.",
            ],
            [
              "403 CAPABILITY_DENIED",
              "The grant no longer authorizes this execution — expired, revoked, out of uses, or the wrong scope.",
            ],
            [
              "409 INVALID_STATE",
              "The request is not in a state that permits this operation, e.g. approving a request that was already denied.",
            ],
            [
              "409 IDEMPOTENCY_KEY_REUSED",
              "The key was already used for a different capability. Keys are scoped to your agent; retrying the same key against the same capability still replays the original result.",
            ],
            [
              "422 VALIDATION_FAILED",
              "The body failed schema validation. Context under 12 characters is the common one.",
            ],
          ].map(([code, meaning]) => (
            <div key={code} className="grid gap-1 px-5 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
              <dt className="font-mono text-sm text-[#2f6b55]">{code}</dt>
              <dd className="text-sm text-[#48544f]">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
