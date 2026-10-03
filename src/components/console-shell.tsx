"use client";

import {
  Activity,
  Bot,
  Boxes,
  ChevronRight,
  FileCheck2,
  KeyRound,
  LayoutGrid,
  Menu,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

type ShellAgent = {
  id: string;
  name: string;
  managerId: string;
  managerName: string;
  status: "active" | "paused";
};

const PRIMARY_NAV = [
  { href: "/console/agents", label: "All agents", icon: Bot },
  { href: "/console/activity", label: "All activity", icon: Activity },
];

const CONTROL_NAV = [
  { href: "/console", label: "Control overview", icon: LayoutGrid },
  { href: "/console/requests", label: "Action requests", icon: FileCheck2 },
  { href: "/console/capabilities", label: "Capabilities", icon: KeyRound },
  { href: "/console/policies", label: "Policies", icon: ShieldCheck },
  { href: "/console/proofs", label: "Proofs", icon: Boxes },
  { href: "/console/audit", label: "Audit ledger", icon: ScrollText },
  { href: "/console/settings", label: "Settings", icon: Settings },
];

function agentInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/console") return pathname === href;
  if (href === "/console/agents") {
    return pathname === href || pathname.startsWith("/console/agents/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof Bot;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-[#dcebe4] text-[#183f32]"
          : "text-[#56625e] hover:bg-[#eef2ee] hover:text-[#14231f]"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`h-4 w-4 ${active ? "text-[#2f6b55]" : "text-[#7b8782]"}`}
        strokeWidth={1.8}
      />
      <span className="flex-1">{label}</span>
      {active ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /> : null}
    </Link>
  );
}

function Sidebar({
  organizationName,
  agents,
  operatorAuthEnabled,
  onNavigate,
}: {
  organizationName: string;
  agents: ShellAgent[];
  operatorAuthEnabled: boolean;
  onNavigate?: () => void;
}) {
  const groups = useMemo(() => {
    const byManager = new Map<string, { name: string; agents: ShellAgent[] }>();

    for (const agent of agents) {
      const current = byManager.get(agent.managerId) ?? {
        name: agent.managerName,
        agents: [],
      };
      current.agents.push(agent);
      byManager.set(agent.managerId, current);
    }

    return [...byManager.entries()].map(([id, group]) => ({ id, ...group }));
  }, [agents]);

  return (
    <div className="flex h-full flex-col bg-[#f8faf7]">
      <div className="border-b border-[#e3e8e2] px-4 py-4">
        <Link
          href="/console/agents"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl focus-visible:outline-offset-4"
        >
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-xl bg-[#153d31] text-sm font-semibold text-[#d8f1e5] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          >
            AO
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-[-0.01em] text-[#14231f]">
              AgentOS
            </span>
            <span className="block truncate text-xs text-[#73807a]">
              {organizationName}
            </span>
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <Link
          href="/console/agents?new=1"
          onClick={onNavigate}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2f6b55] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(20,35,31,0.12)] transition-[background-color,transform] duration-150 hover:bg-[#285c4a] active:scale-[0.98]"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          New agent
        </Link>

        <nav aria-label="Workspace" className="space-y-1">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={onNavigate} />
          ))}
        </nav>

        <div className="my-5 h-px bg-[#e5e9e4]" />

        <section aria-labelledby="accountability-groups">
          <div className="flex items-center justify-between px-3">
            <h2
              id="accountability-groups"
              className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#87918d]"
            >
              Accountability groups
            </h2>
            <span className="rounded-full bg-[#eef2ee] px-2 py-0.5 text-[0.65rem] font-medium text-[#6b7772]">
              Demo
            </span>
          </div>

          <div className="mt-2 space-y-4">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="px-3 text-xs font-medium text-[#5b6762]">
                  {group.name}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.agents.map((agent) => (
                    <li key={agent.id}>
                      <Link
                        href={`/console/agents/builder?agent=${agent.id}`}
                        onClick={onNavigate}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs text-[#5f6c66] transition-colors hover:bg-[#eef2ee] hover:text-[#14231f]"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-6 w-6 place-items-center rounded-lg bg-white text-[0.58rem] font-semibold text-[#2f6b55] ring-1 ring-inset ring-[#dce3dd]"
                        >
                          {agentInitials(agent.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            agent.status === "active" ? "bg-[#55a87d]" : "bg-[#c48a41]"
                          }`}
                          title={agent.status}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="my-5 h-px bg-[#e5e9e4]" />

        <nav aria-label="Control plane" className="space-y-1">
          <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#87918d]">
            Control plane
          </p>
          {CONTROL_NAV.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={onNavigate} />
          ))}
        </nav>
      </div>

      <div className="border-t border-[#e3e8e2] p-3">
        {operatorAuthEnabled ? (
          <form action="/api/operator/sign-out" method="post">
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[#5f6c66] transition-colors hover:bg-[#eef2ee] hover:text-[#14231f]"
            >
              Sign out
            </button>
          </form>
        ) : (
          <div className="rounded-xl border border-[#ead9ae] bg-[#fbf5e5] px-3 py-2.5">
            <p className="text-xs font-semibold text-[#725616]">Demo workspace</p>
            <p className="mt-0.5 text-[0.68rem] leading-4 text-[#8a7138]">
              Seeded records · state resets on restart
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ConsoleShell({
  children,
  organizationName,
  agents,
  operatorAuthEnabled,
}: {
  children: ReactNode;
  organizationName: string;
  agents: ShellAgent[];
  operatorAuthEnabled: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const fullWorkspace =
    pathname.startsWith("/console/agents") || pathname === "/console/activity";

  return (
    <div className="min-h-screen bg-[#f3f5f1] lg:grid lg:grid-cols-[252px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-[#dde3dc] lg:block">
        <Sidebar
          organizationName={organizationName}
          agents={agents}
          operatorAuthEnabled={operatorAuthEnabled}
        />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#dde3dc] bg-[#f8faf7]/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open workspace navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-[#44514c] transition-colors hover:bg-[#edf1ed] active:scale-[0.97]"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <Link href="/console/agents" className="text-sm font-semibold text-[#14231f]">
            AgentOS
          </Link>
          <Link
            href="/console/agents?new=1"
            aria-label="New agent"
            className="grid h-9 w-9 place-items-center rounded-lg bg-[#2f6b55] text-white active:scale-[0.97]"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Link>
        </header>

        <main
          className={
            fullWorkspace
              ? "min-h-screen min-w-0"
              : "mx-auto min-h-screen w-full min-w-0 max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          }
        >
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close workspace navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-[#0d1c17]/35"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="absolute inset-y-0 left-0 w-[min(88vw,320px)] border-r border-[#dde3dc] shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close workspace navigation"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg text-[#66736e] hover:bg-[#edf1ed]"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <Sidebar
              organizationName={organizationName}
              agents={agents}
              operatorAuthEnabled={operatorAuthEnabled}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
