import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trust model",
  description:
    "What AgentOS protects, what it does not, and where the boundaries sit.",
};

const BOUNDARIES = [
  {
    title: "The agent boundary",
    holds:
      "An agent holds one API key that identifies it and nothing else. It can ask for authority and redeem grants issued to it.",
    breaks:
      "A stolen agent key lets an attacker submit requests as that agent. Policy still applies, approvals still apply, and every request is attributed. It cannot read another agent's grants or obtain a credential.",
  },
  {
    title: "The policy boundary",
    holds:
      "Policy evaluation is pure and deterministic: same inputs, same decision, no clock reads and no I/O inside the evaluator.",
    breaks:
      "Whoever can edit policy can widen authority. Policy editing is an operator action and is not exposed to agents on any surface.",
  },
  {
    title: "The capability boundary",
    holds:
      "A grant names one action kind, one resource, one counterparty, one amount ceiling, a use count and an expiry. Scope is re-checked at redemption, not only at issuance.",
    breaks:
      "A grant is a bearer token for its own narrow scope. The mitigations are short TTLs, single use, and immediate revocation.",
  },
  {
    title: "The custody boundary",
    holds:
      "AgentOS holds no credentials. The sandbox connector settles nothing, so there is nothing to steal from this deployment.",
    breaks:
      "A production connector must hold real credentials. That belongs behind a dedicated vault with its own trust boundary — deliberately not built here, because writing custody cryptography by hand is how people lose money.",
  },
  {
    title: "The proof boundary",
    holds:
      "Only commitments cross into the proof layer. The policy body, the amount, the counterparty and the agent identity never do.",
    breaks:
      "Local anchors are recomputable by anyone holding the preimages, but they are published nowhere, so a third party cannot verify them and the operator could in principle rewrite them. Publishing to Midnight is what fixes that.",
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-[#14231f] sm:text-4xl">
        Trust model
      </h1>
      <p className="mt-4 text-lg text-[#48544f]">
        Security claims are only useful when they say what happens when they
        fail. Each boundary below states what it holds and what an attacker gets
        when it breaks.
      </p>

      <div className="mt-10 space-y-4">
        {BOUNDARIES.map((boundary) => (
          <section
            key={boundary.title}
            className="card-shadow rounded-2xl border border-[#dde2dc] bg-white p-5"
          >
            <h2 className="text-base font-semibold text-[#14231f]">
              {boundary.title}
            </h2>
            <dl className="mt-3 space-y-3 text-sm leading-relaxed">
              <div>
                <dt className="font-medium text-[#1f513f]">What it holds</dt>
                <dd className="mt-1 text-[#48544f]">{boundary.holds}</dd>
              </div>
              <div>
                <dt className="font-medium text-[#8a2f28]">
                  What an attacker gets when it breaks
                </dt>
                <dd className="mt-1 text-[#48544f]">{boundary.breaks}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Not built, on purpose
        </h2>
        <ul className="mt-4 space-y-2 text-[#48544f]">
          <li>
            <strong className="font-medium text-[#14231f]">
              Credential custody.
            </strong>{" "}
            No vault, no card issuance, no bank rails. The connector port is
            where a real provider plugs in.
          </li>
          <li>
            <strong className="font-medium text-[#14231f]">
              Bespoke cryptography.
            </strong>{" "}
            Commitments use SHA-256 from the Node standard library. The
            zero-knowledge machinery is the Compact compiler&rsquo;s job, not
            ours.
          </li>
          <li>
            <strong className="font-medium text-[#14231f]">
              Durable storage.
            </strong>{" "}
            State lives in the server process and is lost on restart. The
            persistence port is the seam a database implements.
          </li>
          <li>
            <strong className="font-medium text-[#14231f]">
              Per-operator identity.
            </strong>{" "}
            Operator access is a single shared token. SSO and per-person
            approval attribution are the next step.
          </li>
        </ul>
      </section>
    </div>
  );
}
