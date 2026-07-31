import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgentOS — scoped authority for autonomous agents",
  description:
    "Give agents the authority to act without giving them your credentials. Policy, approval, short-lived capabilities and a private proof trail.",
};

const LIFECYCLE = [
  {
    step: "01",
    title: "The agent asks",
    body: "An agent states an intent — amount, counterparty, resource, and why. Not a credential request. An intent that a person can read and judge.",
  },
  {
    step: "02",
    title: "Policy decides",
    body: "The request is evaluated against the policy that governs this agent: ceiling, currency, counterparty allowlist, rolling spend window, expiry.",
  },
  {
    step: "03",
    title: "A human approves what matters",
    body: "Small, routine spend clears automatically. Anything above the threshold waits for the named approvers on the policy.",
  },
  {
    step: "04",
    title: "Authority is issued, not credentials",
    body: "A capability grant is minted for this counterparty, this amount ceiling, this many uses, expiring in minutes. The agent never sees a card number or a key.",
  },
  {
    step: "05",
    title: "Every decision is provable",
    body: "The audit ledger records what happened. A commitment to the decision is anchored — the fact is verifiable, the amount and counterparty are not disclosed.",
  },
];

const CONTROLS = [
  {
    intent: "“Buy the search credits you need.”",
    control: "Capped at $50 a week, sandbox vendors only, auto-approved under $10.",
  },
  {
    intent: "“Pay the invoice from our hosting vendor.”",
    control: "Approved counterparties only, two approvers above $1,000.",
  },
  {
    intent: "“Handle the incident, spend what it takes.”",
    control: "One capability, one use, expires in 15 minutes, revocable instantly.",
  },
];

export default function MarketingHome() {
  return (
    <>
      <section className="dashboard-grid border-b border-[#dde2dc]">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2f6b55]">
            The control plane for agents that act
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-[#14231f] sm:text-5xl lg:text-6xl">
            Give your agents authority.
            <br />
            Never give them your credentials.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#48544f]">
            An agent that can pay is an agent that can be exploited. AgentOS puts
            a policy engine, a human approval step and a short-lived capability
            between the agent and the money — so the blast radius of a
            compromised agent is one scoped grant, not your account.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/console"
              className="rounded-lg bg-[#2f6b55] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#255a47]"
            >
              Explore the console
            </Link>
            <Link
              href="/docs"
              className="rounded-lg border border-[#c9d2ca] bg-white px-5 py-2.5 text-sm font-medium text-[#14231f] transition-colors hover:border-[#9fb3a6]"
            >
              Connect an agent
            </Link>
          </div>

          <p className="mt-6 text-sm text-[#66736e]">
            Runs against a sandbox connector that settles nothing. No real money
            moves.
          </p>
        </div>
      </section>

      <section className="border-b border-[#dde2dc] bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-[#14231f] sm:text-3xl">
            The gap between “can act” and “should act”
          </h2>
          <p className="mt-4 max-w-2xl text-[#48544f]">
            Handing an agent an API key makes it powerful and unaccountable at
            the same moment. AgentOS closes that gap with five steps that always
            run in the same order.
          </p>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#dde2dc] bg-[#dde2dc] sm:grid-cols-2 lg:grid-cols-5">
            {LIFECYCLE.map((item) => (
              <li key={item.step} className="flex flex-col bg-white p-5">
                <span className="font-mono text-xs text-[#2f6b55]">
                  {item.step}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-[#14231f]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#66736e]">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-[#dde2dc]">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-[#14231f] sm:text-3xl">
            Every instruction pairs with the control that makes it safe
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {CONTROLS.map((item) => (
              <div
                key={item.intent}
                className="card-shadow rounded-2xl border border-[#dde2dc] bg-white p-5"
              >
                <p className="text-base font-medium leading-snug text-[#14231f]">
                  {item.intent}
                </p>
                <p className="mt-3 border-t border-[#eef1ee] pt-3 text-sm leading-relaxed text-[#66736e]">
                  {item.control}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#dde2dc] bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[#14231f] sm:text-3xl">
              One endpoint for the model. One console for the humans.
            </h2>
            <p className="mt-4 text-[#48544f]">
              Agents connect to a single MCP endpoint and get four tools: see
              their capabilities, ask for authority, check a decision, redeem a
              grant. There is no tool that returns a credential, because no such
              tool exists.
            </p>
            <p className="mt-4 text-[#48544f]">
              Operators get the other half: who asked, what policy said, who
              approved, what was spent, and a revoke button that works
              immediately.
            </p>
            <Link
              href="/docs"
              className="mt-6 inline-flex rounded-lg border border-[#c9d2ca] bg-white px-4 py-2 text-sm font-medium text-[#14231f] transition-colors hover:border-[#9fb3a6]"
            >
              Read the integration guide
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#22332d] bg-[#14231f]">
            <div className="border-b border-[#2a3d36] px-4 py-2.5">
              <span className="font-mono text-xs text-[#8fae9f]">
                POST /api/mcp · tools/call
              </span>
            </div>
            <pre className="overflow-x-auto px-4 py-4 text-[0.78rem] leading-relaxed text-[#d6e2db]">
              <code>{`{
  "name": "request_payment",
  "arguments": {
    "policyId": "pol_vendor_invoice",
    "amountMinor": 45000,
    "currency": "USD",
    "counterpartyId": "cpty_acme",
    "counterpartyName": "Acme Cloud",
    "resource": "vendor:acme/invoice",
    "reference": "INV-2291",
    "context": "October hosting invoice, matches the signed contract."
  }
}

→ { "state": "pending_approval",
    "requiredApprovals": 1 }`}</code>
            </pre>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-[#14231f] sm:text-3xl">
            Prove the rule was followed without publishing the payment
          </h2>
          <p className="mt-4 max-w-2xl text-[#48544f]">
            Audit normally means showing an auditor your books. AgentOS anchors a
            commitment to each decision instead: a nullifier proving this
            decision happened exactly once, under a policy that was registered
            before the fact. The amount, the counterparty and the agent stay in
            your infrastructure.
          </p>
          <p className="mt-4 max-w-2xl text-[#48544f]">
            The on-chain half is a Compact contract for Midnight. Until it is
            configured, AgentOS records the same commitments locally and says so
            plainly rather than inventing a transaction hash.
          </p>
          <Link
            href="/security"
            className="mt-6 inline-flex rounded-lg bg-[#2f6b55] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#255a47]"
          >
            See the trust model
          </Link>
        </div>
      </section>
    </>
  );
}
