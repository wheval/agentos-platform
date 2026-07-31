const styles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  authorized: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  allowed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending_approval: "bg-amber-50 text-amber-800 ring-amber-600/20",
  capability_issued: "bg-sky-50 text-sky-700 ring-sky-600/20",
  delivered: "bg-sky-50 text-sky-700 ring-sky-600/20",
  denied: "bg-rose-50 text-rose-700 ring-rose-600/20",
  rejected: "bg-rose-50 text-rose-700 ring-rose-600/20",
  paused: "bg-slate-100 text-slate-600 ring-slate-500/20",
  draft: "bg-violet-50 text-violet-700 ring-violet-600/20",
  info: "bg-slate-100 text-slate-700 ring-slate-500/20",
};

const defaultStyle = "bg-slate-100 text-slate-700 ring-slate-500/20";

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset ${styles[status] ?? defaultStyle}`}
    >
      {humanize(status)}
    </span>
  );
}
