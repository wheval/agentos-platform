import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/console-shell";
import { getWorkspace } from "@/lib/workspace";
import { operatorAuthConfigured, readOperatorSession } from "@/lib/operator-session";

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await readOperatorSession();

  if (!session.authenticated) redirect("/signin");

  const workspace = getWorkspace();
  const agents = await workspace.store.listAgents();

  return (
    <ConsoleShell
      organizationName={workspace.organizationName}
      agents={agents.map(({ id, name, managerId, managerName, status }) => ({
        id,
        name,
        managerId,
        managerName,
        status,
      }))}
      operatorAuthEnabled={operatorAuthConfigured()}
    >
      {children}
    </ConsoleShell>
  );
}
