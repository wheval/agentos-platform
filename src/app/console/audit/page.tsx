import Link from "next/link";
import { Badge, Card, EmptyState, Mono } from "@/components/ui";
import { formatDateTime, outcomeTone } from "@/components/format";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Audit ledger" };

export default async function AuditPage() {
  const { store } = getWorkspace();
  const events = await store.listAuditEvents();

  const ordered = [...events].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Audit ledger
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          Append-only. Every authority decision, approval, grant, redemption and
          rejected credential lands here, written by the authority service and
          nowhere else.
        </p>
      </div>

      <Card>
        {ordered.length === 0 ? (
          <EmptyState>Nothing recorded yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-[#eef1ee]">
            {ordered.map((event) => {
              const metadata = Object.entries(event.metadata);

              return (
                <li key={event.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 text-sm text-[#14231f]">
                      {event.summary}
                    </p>
                    <Badge
                      tone={outcomeTone(
                        event.outcome === "failed" ? "denied" : event.outcome,
                      )}
                    >
                      {event.outcome}
                    </Badge>
                  </div>

                  <p className="mt-1.5 text-xs text-[#66736e]">
                    <Mono>{event.eventType}</Mono> · {event.actor.displayName} (
                    {event.actor.type}) · {formatDateTime(event.occurredAt)}
                    {event.actionRequestId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/console/requests/${event.actionRequestId}`}
                          className="text-[#2f6b55] hover:underline"
                        >
                          {event.actionRequestId}
                        </Link>
                      </>
                    ) : null}
                  </p>

                  {metadata.length > 0 ? (
                    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#66736e]">
                      {metadata.map(([key, value]) => (
                        <div key={key} className="flex gap-1.5">
                          <dt>{key}</dt>
                          <dd className="text-[#33413c]">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
