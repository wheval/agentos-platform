import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getWorkspace } from "@/lib/workspace";
import { operatorAuthConfigured, readOperatorSession } from "@/lib/operator-session";

const NAV = [
  { href: "/console", label: "Overview" },
  { href: "/console/requests", label: "Requests" },
  { href: "/console/capabilities", label: "Capabilities" },
  { href: "/console/agents", label: "Agents" },
  { href: "/console/policies", label: "Policies" },
  { href: "/console/proofs", label: "Proofs" },
  { href: "/console/audit", label: "Audit ledger" },
  { href: "/console/settings", label: "Settings" },
];

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await readOperatorSession();

  if (!session.authenticated) redirect("/signin");

  const workspace = getWorkspace();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#dde2dc] bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-[#14231f]"
            >
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-lg bg-[#2f6b55] text-[0.7rem] font-bold text-white"
              >
                A
              </span>
              AgentOS
            </Link>
            <span className="hidden text-sm text-[#66736e] sm:inline">
              {workspace.organizationName}
            </span>
          </div>

          {operatorAuthConfigured() ? (
            <form action="/api/operator/sign-out" method="post">
              <button
                type="submit"
                className="rounded-md border border-[#c9d2ca] px-3 py-1.5 text-sm text-[#48544f] transition-colors hover:border-[#9fb3a6] hover:text-[#14231f]"
              >
                Sign out
              </button>
            </form>
          ) : (
            <span className="rounded-full bg-[#fbf0d8] px-3 py-1 text-xs font-medium text-[#7a5713] ring-1 ring-inset ring-[#ecd8a6]">
              Demo mode · open access
            </span>
          )}
        </div>

        <nav
          aria-label="Console"
          className="mx-auto w-full max-w-7xl overflow-x-auto px-5"
        >
          <ul className="flex min-w-max items-center gap-1 pb-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-1.5 text-sm text-[#48544f] transition-colors hover:bg-[#eef1ee] hover:text-[#14231f]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">
        {children}
      </main>
    </div>
  );
}
