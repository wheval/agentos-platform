import { Badge, Card, CardHeader, DemoNotice, Mono } from "@/components/ui";
import { readMidnightConfig } from "@/infrastructure/midnight-proof-anchor";
import { operatorAuthConfigured } from "@/lib/operator-session";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { store, bootstrapApiKeys, proofAnchor, organizationName } =
    getWorkspace();
  const [connectors, apiKeys] = await Promise.all([
    store.listConnectors(),
    store.listApiKeys(),
  ]);

  const midnight = readMidnightConfig(process.env);
  const secretByAgent = new Map(
    bootstrapApiKeys.map((key) => [key.agentId, key.secret]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#14231f]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#66736e]">
          {organizationName} · configuration and credentials.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Agent API keys"
          description="Only the SHA-256 digest is stored. Plaintext is generated at boot, held in memory, and lost on restart."
        />
        <div className="px-5 py-4">
          <DemoNotice>
            These keys are shown because this is a demo workspace with no real
            authority behind them. A production console would show a secret once
            at creation and never again.
          </DemoNotice>

          <ul className="mt-4 divide-y divide-[#eef1ee]">
            {apiKeys.map((key) => {
              const secret = secretByAgent.get(key.agentId);

              return (
                <li key={key.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <p className="text-sm font-medium text-[#14231f]">
                      {key.name}
                    </p>
                    <Badge tone={key.revokedAt ? "critical" : "positive"}>
                      {key.revokedAt ? "revoked" : "active"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[#66736e]">
                    <Mono>{key.agentId}</Mono> · prefix <Mono>{key.prefix}</Mono>
                  </p>
                  {secret ? (
                    <p className="mt-1.5">
                      <Mono>{secret}</Mono>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Connectors" />
          <ul className="divide-y divide-[#eef1ee]">
            {connectors.map((connector) => (
              <li key={connector.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-sm font-medium text-[#14231f]">
                    {connector.name}
                  </p>
                  <Badge
                    tone={connector.status === "active" ? "positive" : "neutral"}
                  >
                    {connector.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[#48544f]">
                  {connector.description}
                </p>
                <p className="mt-1 text-xs text-[#66736e]">
                  <Mono>{connector.kind}</Mono>
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Environment" />
          <dl className="divide-y divide-[#eef1ee]">
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-sm text-[#66736e]">Operator auth</dt>
              <dd>
                <Badge tone={operatorAuthConfigured() ? "positive" : "caution"}>
                  {operatorAuthConfigured()
                    ? "token required"
                    : "demo · open access"}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-sm text-[#66736e]">Proof anchor</dt>
              <dd>
                <Badge
                  tone={proofAnchor.network === "local" ? "caution" : "positive"}
                >
                  {proofAnchor.network} · {proofAnchor.status}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-sm text-[#66736e]">Midnight config</dt>
              <dd>
                <Badge tone={midnight.configured ? "positive" : "neutral"}>
                  {midnight.configured ? "complete" : "not set"}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-sm text-[#66736e]">Persistence</dt>
              <dd>
                <Badge tone="caution">in-memory · resets on restart</Badge>
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
