import type { ReactNode } from "react";

/** Presentational primitives shared by the console and marketing surfaces. */

const TONES = {
  neutral: "bg-[#eef1ee] text-[#48544f] ring-[#d5dcd6]",
  positive: "bg-[#dcebe4] text-[#1f513f] ring-[#b6d5c5]",
  caution: "bg-[#fbf0d8] text-[#7a5713] ring-[#ecd8a6]",
  critical: "bg-[#fbe2e0] text-[#8a2f28] ring-[#eec3bf]",
  info: "bg-[#e2e9f6] text-[#2c4576] ring-[#c2d1ea]",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`card-shadow rounded-2xl border border-[#dde2dc] bg-white ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eaeee9] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-[#14231f]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-[#66736e]">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="px-5 py-10 text-center text-sm text-[#66736e]">{children}</p>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#dde2dc] bg-white px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-[#66736e]">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[#14231f]">
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-[#66736e]">{hint}</p> : null}
    </div>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-xl border border-[#ecd8a6] bg-[#fbf6e8] px-4 py-3 text-sm text-[#6d5111]"
    >
      {children}
    </p>
  );
}

export function DefinitionRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-[#eef1ee] px-5 py-3 last:border-0 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-4">
      <dt className="text-sm text-[#66736e]">{label}</dt>
      <dd className="min-w-0 text-sm text-[#14231f]">{children}</dd>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="break-all font-mono text-[0.8rem] text-[#33413c]">
      {children}
    </code>
  );
}
