import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/security", label: "Trust model" },
  { href: "/docs", label: "Docs" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[#dde2dc] bg-[#f4f5f2]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md text-sm font-semibold tracking-tight text-[#14231f]"
          >
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-lg bg-[#2f6b55] text-[0.7rem] font-bold text-white"
            >
              A
            </span>
            AgentOS
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-[#48544f] transition-colors hover:bg-[#e7ebe6] hover:text-[#14231f]"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/console"
              className="ml-1 rounded-md bg-[#2f6b55] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#255a47]"
            >
              Open console
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#dde2dc] px-5 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 text-sm text-[#66736e] sm:flex-row sm:items-center sm:justify-between">
          <p>AgentOS — the control plane for agents that act.</p>
          <p>
            Open source. Demo workspace only; no real payments are processed.
          </p>
        </div>
      </footer>
    </div>
  );
}
