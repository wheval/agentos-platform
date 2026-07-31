import { Badge, Card, EmptyState, Mono } from "@/components/ui";
import { formatMoney } from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Policies" };

export default async function PoliciesPage() {
  const { store } = getWorkspace();
  const policies = await store.listPolicies();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Policies
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          A policy is the whole authority envelope: what may be spent, with whom,
          on what, for how long, and who has to say yes. Policy editing is
          intentionally not exposed to agents on any surface.
        </p>
      </div>

      {policies.length === 0 ? (
        <Card>
          <EmptyState>No policies configured.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {policies.map((policy) => {
            const { constraints, approvalRule } = policy;

            return (
              <Card key={policy.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[#14231f]">
                      {policy.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#66736e]">
                      <Mono>{policy.id}</Mono> · v{policy.version}
                    </p>
                  </div>
                  <Badge
                    tone={
                      policy.status === "active"
                        ? "positive"
                        : policy.status === "draft"
                          ? "caution"
                          : "neutral"
                    }
                  >
                    {policy.status}
                  </Badge>
                </div>

                <p className="mt-3 text-sm text-[#48544f]">{policy.description}</p>

                <dl className="mt-4 space-y-2 border-t border-[#eef1ee] pt-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#66736e]">Per-transaction ceiling</dt>
                    <dd className="text-right tabular-nums text-[#14231f]">
                      {formatMoney(constraints.maxAmountMinor, constraints.currency)}
                    </dd>
                  </div>

                  {constraints.spendWindow ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-[#66736e]">Rolling window</dt>
                      <dd className="text-right tabular-nums text-[#14231f]">
                        {formatMoney(
                          constraints.spendWindow.maxAmountMinor,
                          constraints.currency,
                        )}{" "}
                        / {constraints.spendWindow.windowHours}h
                      </dd>
                    </div>
                  ) : null}

                  <div className="flex justify-between gap-4">
                    <dt className="text-[#66736e]">Standing authority</dt>
                    <dd className="text-right text-[#14231f]">
                      {approvalRule.autoApproveBelowMinor
                        ? `Under ${formatMoney(approvalRule.autoApproveBelowMinor, constraints.currency)}`
                        : "None — every request needs approval"}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-[#66736e]">Approvals required</dt>
                    <dd className="text-right text-[#14231f]">
                      {approvalRule.threshold} of {approvalRule.approverIds.length}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-[#66736e]">Capability lifetime</dt>
                    <dd className="text-right tabular-nums text-[#14231f]">
                      {constraints.capabilityTtlSeconds}s
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-[#66736e]">Resource</dt>
                    <dd className="text-right">
                      <Mono>{constraints.resource}</Mono>
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-[#66736e]">Counterparties</dt>
                    <dd className="text-right text-[#14231f]">
                      {constraints.approvedCounterpartyIds.length} allowlisted
                    </dd>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
