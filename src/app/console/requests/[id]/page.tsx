import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveRequestAction,
  executeCapabilityAction,
  issueCapabilityAction,
  revokeCapabilityAction,
} from "@/app/console/actions";
import { ActionForm, Field, inputClassName } from "@/components/action-form";
import {
  Badge,
  Card,
  CardHeader,
  DefinitionRow,
  Mono,
} from "@/components/ui";
import {
  capabilityTone,
  formatDateTime,
  formatMoney,
  formatRelative,
  humanize,
  requestTone,
} from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const APPROVERS = [
  { id: "usr_maya", name: "Maya Chen" },
  { id: "usr_omar", name: "Omar Haddad" },
  { id: "usr_nora", name: "Nora Singh" },
];

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { store } = getWorkspace();
  const request = await store.getActionRequest(id);

  if (!request) notFound();

  const [agent, policy, approvals, allCapabilities, receipts, events] =
    await Promise.all([
      store.getAgent(request.agentId),
      store.getPolicy(request.policyId),
      store.listApprovalsForRequest(request.id),
      store.listCapabilities(),
      store.listReceipts(),
      store.listAuditEvents(),
    ]);

  const capabilities = allCapabilities.filter(
    (capability) => capability.actionRequestId === request.id,
  );
  const requestReceipts = receipts.filter(
    (receipt) => receipt.actionRequestId === request.id,
  );
  const timeline = events
    .filter((event) => event.actionRequestId === request.id)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const evaluation = request.policyEvaluation;
  const approvalsGiven = approvals.filter(
    (approval) => approval.decision === "approved",
  ).length;
  const eligibleApprovers = APPROVERS.filter((approver) =>
    policy?.approvalRule.approverIds.includes(approver.id),
  );
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/console/requests"
          className="text-sm text-[#2f6b55] hover:underline"
        >
          ← All requests
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
            {formatMoney(request.input.amountMinor, request.input.currency)} to{" "}
            {request.input.counterpartyName}
          </h1>
          <Badge tone={requestTone(request.state)}>
            {humanize(request.state)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-[#66736e]">
          <Mono>{request.id}</Mono>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="The ask"
              description="What the agent stated, in its own words."
            />
            <dl>
              <DefinitionRow label="Context">
                {request.input.context}
              </DefinitionRow>
              <DefinitionRow label="Agent">
                {agent ? `${agent.name} · manager ${agent.managerName}` : request.agentId}
              </DefinitionRow>
              <DefinitionRow label="Counterparty">
                {request.input.counterpartyName}{" "}
                <Mono>{request.input.counterpartyId}</Mono>
              </DefinitionRow>
              <DefinitionRow label="Resource">
                <Mono>{request.input.resource}</Mono>
              </DefinitionRow>
              <DefinitionRow label="Reference">
                {request.input.reference}
              </DefinitionRow>
              <DefinitionRow label="Submitted">
                {formatDateTime(request.createdAt)} ({formatRelative(request.createdAt, now)})
              </DefinitionRow>
            </dl>
          </Card>

          {evaluation ? (
            <Card>
              <CardHeader
                title="Policy decision"
                description={
                  policy
                    ? `${policy.name} · version ${evaluation.policyVersion}`
                    : `Policy ${evaluation.policyId}`
                }
              />
              <dl>
                <DefinitionRow label="Outcome">
                  <Badge
                    tone={
                      evaluation.status === "approved"
                        ? "positive"
                        : evaluation.status === "denied"
                          ? "critical"
                          : "caution"
                    }
                  >
                    {humanize(evaluation.status)}
                  </Badge>
                </DefinitionRow>
                <DefinitionRow label="Reasons">
                  <ul className="space-y-1">
                    {evaluation.reasonCodes.map((code) => (
                      <li key={code}>
                        <Mono>{code}</Mono>
                      </li>
                    ))}
                  </ul>
                </DefinitionRow>
                <DefinitionRow label="Approvals required">
                  {evaluation.requiredApprovals} · {approvalsGiven} recorded
                </DefinitionRow>
                {evaluation.spendWindow ? (
                  <DefinitionRow label="Spend window">
                    {formatMoney(
                      evaluation.spendWindow.projectedSpendMinor,
                      request.input.currency,
                    )}{" "}
                    of{" "}
                    {formatMoney(
                      evaluation.spendWindow.maxAmountMinor,
                      request.input.currency,
                    )}{" "}
                    committed over {evaluation.spendWindow.windowHours}h
                  </DefinitionRow>
                ) : null}
              </dl>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Timeline" description="Every recorded event." />
            {timeline.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#66736e]">
                No events recorded for this request.
              </p>
            ) : (
              <ol className="divide-y divide-[#eef1ee]">
                {timeline.map((event) => (
                  <li key={event.id} className="px-5 py-3">
                    <p className="text-sm text-[#14231f]">{event.summary}</p>
                    <p className="mt-1 text-xs text-[#66736e]">
                      <Mono>{event.eventType}</Mono> · {event.actor.displayName} ·{" "}
                      {formatDateTime(event.occurredAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {request.state === "pending_approval" && eligibleApprovers.length > 0 ? (
            <Card>
              <CardHeader
                title="Record a decision"
                description="Approver identity is selected here because this milestone has no per-operator accounts."
              />
              <div className="px-5 py-4">
                <ActionForm action={approveRequestAction} submitLabel="Submit decision">
                  <input type="hidden" name="actionRequestId" value={request.id} />

                  <div className="space-y-3">
                    <Field label="Approver">
                      <select
                        name="approver"
                        className={inputClassName}
                        defaultValue={`${eligibleApprovers[0]?.id}|${eligibleApprovers[0]?.name}`}
                      >
                        {eligibleApprovers.map((approver) => (
                          <option
                            key={approver.id}
                            value={`${approver.id}|${approver.name}`}
                          >
                            {approver.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Decision">
                      <select
                        name="decision"
                        className={inputClassName}
                        defaultValue="approved"
                      >
                        <option value="approved">Approve</option>
                        <option value="rejected">Reject</option>
                      </select>
                    </Field>

                    <Field label="Reason" hint="Optional, recorded in the ledger.">
                      <input
                        type="text"
                        name="reason"
                        maxLength={500}
                        className={inputClassName}
                        placeholder="Matches the signed contract"
                      />
                    </Field>
                  </div>
                </ActionForm>
              </div>
            </Card>
          ) : null}

          {request.state === "approved" ? (
            <Card>
              <CardHeader
                title="Issue authority"
                description="Mints a grant scoped to this counterparty, amount and expiry. No credential is created."
              />
              <div className="px-5 py-4">
                <ActionForm action={issueCapabilityAction} submitLabel="Issue capability">
                  <input type="hidden" name="actionRequestId" value={request.id} />
                </ActionForm>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Capabilities" />
            {capabilities.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#66736e]">
                No capability has been issued for this request.
              </p>
            ) : (
              <ul className="divide-y divide-[#eef1ee]">
                {capabilities.map((capability) => {
                  const expired = new Date(capability.expiresAt) <= now;
                  const redeemable = capability.status === "active" && !expired;

                  return (
                    <li key={capability.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Mono>{capability.id}</Mono>
                        <Badge
                          tone={capabilityTone(
                            expired && capability.status === "active"
                              ? "expired"
                              : capability.status,
                          )}
                        >
                          {expired && capability.status === "active"
                            ? "expired"
                            : capability.status}
                        </Badge>
                      </div>

                      <p className="mt-2 text-sm text-[#48544f]">
                        Ceiling{" "}
                        {formatMoney(
                          capability.scope.amountLimitMinor,
                          capability.scope.currency,
                        )}{" "}
                        · {capability.usesRemaining} of {capability.maxUses} uses ·
                        expires {formatRelative(capability.expiresAt, now)}
                      </p>

                      {redeemable ? (
                        <div className="mt-3 space-y-4">
                          <ActionForm
                            action={executeCapabilityAction}
                            submitLabel="Redeem in sandbox"
                            variant="secondary"
                          >
                            <input
                              type="hidden"
                              name="capabilityId"
                              value={capability.id}
                            />
                            <input
                              type="hidden"
                              name="agentId"
                              value={capability.issuedToAgentId}
                            />
                            <Field
                              label="Idempotency key"
                              hint="Reusing a key returns the original receipt instead of settling twice."
                            >
                              <input
                                type="text"
                                name="idempotencyKey"
                                minLength={8}
                                maxLength={120}
                                required
                                className={inputClassName}
                                defaultValue={`${capability.id}-attempt-1`}
                              />
                            </Field>
                          </ActionForm>

                          <ActionForm
                            action={revokeCapabilityAction}
                            submitLabel="Revoke"
                            variant="danger"
                          >
                            <input
                              type="hidden"
                              name="capabilityId"
                              value={capability.id}
                            />
                            <Field label="Reason">
                              <input
                                type="text"
                                name="reason"
                                maxLength={280}
                                className={inputClassName}
                                placeholder="Vendor identity unverified"
                              />
                            </Field>
                          </ActionForm>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {requestReceipts.length > 0 ? (
            <Card>
              <CardHeader title="Receipts" description="Sandbox settlement records." />
              <ul className="divide-y divide-[#eef1ee]">
                {requestReceipts.map((receipt) => (
                  <li key={receipt.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Mono>{receipt.providerReference ?? receipt.id}</Mono>
                      <Badge
                        tone={receipt.status === "succeeded" ? "positive" : "critical"}
                      >
                        {receipt.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[#66736e]">
                      {formatMoney(receipt.amountMinor, receipt.currency)} ·{" "}
                      {formatDateTime(receipt.executedAt)}
                    </p>
                    {receipt.failureReason ? (
                      <p className="mt-1 text-xs text-[#8a2f28]">
                        {receipt.failureReason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
