import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, Mono } from "@/components/ui";
import { formatDateTime, humanize } from "@/components/format";
import { readMidnightConfig } from "@/infrastructure/midnight-proof-anchor";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Proofs" };

const ANCHOR_STATE_TONE = {
  recorded: "caution",
  submitted: "info",
  confirmed: "positive",
  failed: "critical",
} as const;

export default async function ProofsPage() {
  const { store, proofAnchor } = getWorkspace();
  const anchors = await store.listProofAnchors();
  const midnight = readMidnightConfig(process.env);

  const ordered = [...anchors].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Proof anchoring
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          Each authority decision produces two commitments: one to the policy
          that authorized it, one nullifier that makes the decision provably
          unique. Amounts, counterparties and agent identities never cross this
          boundary.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Active adapter" />
          <dl className="space-y-2 px-5 py-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#66736e]">Network</dt>
              <dd>
                <Badge tone={proofAnchor.network === "local" ? "caution" : "positive"}>
                  {proofAnchor.network}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[#66736e]">Status</dt>
              <dd>
                <Badge
                  tone={proofAnchor.status === "ready" ? "positive" : "critical"}
                >
                  {proofAnchor.status}
                </Badge>
              </dd>
            </div>
            <p className="border-t border-[#eef1ee] pt-3 text-[#48544f]">
              {proofAnchor.description}
            </p>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Midnight configuration" />
          <div className="space-y-3 px-5 py-4 text-sm">
            {midnight.configured ? (
              <>
                <p className="text-[#48544f]">
                  Configured for <Mono>{midnight.config.network}</Mono> at{" "}
                  <Mono>{midnight.config.contractAddress}</Mono>.
                </p>
                <p className="text-[#48544f]">
                  A transaction submitter must be supplied before anchoring can
                  reach the chain. Until then the adapter refuses to anchor
                  rather than reporting a hash it never obtained.
                </p>
              </>
            ) : (
              <>
                <p className="text-[#48544f]">
                  Not configured. Missing{" "}
                  {midnight.missing.map((name, index) => (
                    <span key={name}>
                      {index > 0 ? ", " : ""}
                      <Mono>{name}</Mono>
                    </span>
                  ))}
                  . Point them at a deployed{" "}
                  <Mono>policy-anchor.compact</Mono>.
                </p>
                <p className="text-[#48544f]">
                  Commitments are being recorded locally in the meantime. They
                  use the same preimage layout as the contract, but they are
                  published nowhere, so a third party cannot verify them.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Anchor log"
          description="One entry per anchored decision."
        />
        {ordered.length === 0 ? (
          <EmptyState>
            No decisions have been anchored yet. Approve a request to produce
            one.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-[#eef1ee]">
            {ordered.map((anchor) => (
              <li key={anchor.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <Link
                    href={`/console/requests/${anchor.actionRequestId}`}
                    className="text-sm font-medium text-[#2f6b55] hover:underline"
                  >
                    {humanize(anchor.outcome)} · {anchor.actionRequestId}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{anchor.network}</Badge>
                    <Badge tone={ANCHOR_STATE_TONE[anchor.state]}>
                      {anchor.state}
                    </Badge>
                  </div>
                </div>

                <dl className="mt-2 space-y-1 text-xs text-[#66736e]">
                  <div className="flex flex-wrap gap-1.5">
                    <dt>Policy commitment</dt>
                    <dd>
                      <Mono>{anchor.policyCommitment}</Mono>
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt>Decision nullifier</dt>
                    <dd>
                      <Mono>{anchor.decisionNullifier}</Mono>
                    </dd>
                  </div>
                  {anchor.transactionHash ? (
                    <div className="flex flex-wrap gap-1.5">
                      <dt>Transaction</dt>
                      <dd>
                        <Mono>{anchor.transactionHash}</Mono>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {anchor.failureReason ? (
                  <p className="mt-1.5 text-xs text-[#8a2f28]">
                    {anchor.failureReason}
                  </p>
                ) : null}

                <p className="mt-1.5 text-xs text-[#66736e]">
                  {formatDateTime(anchor.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
