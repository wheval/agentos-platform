import { randomBytes } from "node:crypto";
import { AuthorityService } from "@/application/authority-service";
import type { PolicyProofAnchor } from "@/application/ports/policy-proof";
import type { AgentOsStore } from "@/application/ports/store";
import { InMemoryAgentOsStore } from "@/infrastructure/in-memory-store";
import { LocalCommitmentAnchor } from "@/infrastructure/local-commitment-anchor";
import { createMidnightProofAnchor } from "@/infrastructure/midnight-proof-anchor";
import { SandboxPaymentConnector } from "@/infrastructure/sandbox-payment-connector";
import {
  buildSeededWorkspace,
  DEMO_ORGANIZATION_ID,
  DEMO_ORGANIZATION_NAME,
  SANDBOX_CONNECTOR_ID,
  type BootstrapApiKey,
} from "@/infrastructure/seed";

/**
 * Composition root.
 *
 * Every adapter choice is made here and nowhere else, so swapping the in-memory
 * store for a database or the local anchor for Midnight is a change to this file
 * alone. Application code depends on ports and never learns which adapter it
 * received.
 */

export type Workspace = {
  store: AgentOsStore;
  authority: AuthorityService;
  proofAnchor: PolicyProofAnchor;
  organizationId: string;
  organizationName: string;
  bootstrapApiKeys: BootstrapApiKey[];
  /** True when no operator secret is configured and the app runs openly. */
  demoMode: boolean;
};

function selectProofAnchor(): PolicyProofAnchor {
  const midnight = createMidnightProofAnchor(process.env);

  // Falling back keeps the product working without a chain, but the console
  // shows which adapter is live so nobody mistakes local records for published
  // proofs.
  return midnight.status === "ready" ? midnight : new LocalCommitmentAnchor();
}

function resolveOrganizationSecret(): string {
  const configured = process.env.AGENTOS_ORGANIZATION_SECRET?.trim();

  if (configured && configured.length >= 32) return configured;

  // A per-boot random secret is the safe default: commitments stay unguessable,
  // and because they do not survive a restart nobody can mistake this instance
  // for a durable audit trail.
  return randomBytes(32).toString("hex");
}

/**
 * Next.js compiles pages, server actions and route handlers into separate
 * bundles, so a module-level `let` is instantiated once per bundle rather than
 * once per process. With in-memory state that is not a caching nicety — it is a
 * correctness bug: the console and the agent API would hold different stores,
 * different seeds and different API keys, and nothing would line up.
 *
 * Pinning the instance to `globalThis` gives one workspace per process. It
 * disappears entirely once a real store adapter makes the process stateless.
 */
const WORKSPACE_KEY = Symbol.for("agentos.workspace");

type WorkspaceGlobal = typeof globalThis & {
  [WORKSPACE_KEY]?: Workspace;
};

export function getWorkspace(): Workspace {
  const globalWithWorkspace = globalThis as WorkspaceGlobal;
  const existing = globalWithWorkspace[WORKSPACE_KEY];

  if (existing) return existing;

  const { seed, bootstrapApiKeys } = buildSeededWorkspace();
  const store = new InMemoryAgentOsStore(seed);
  const proofAnchor = selectProofAnchor();

  const workspace: Workspace = {
    store,
    proofAnchor,
    organizationId: DEMO_ORGANIZATION_ID,
    organizationName: DEMO_ORGANIZATION_NAME,
    bootstrapApiKeys,
    demoMode: !process.env.AGENTOS_OPERATOR_TOKEN,
    authority: new AuthorityService({
      store,
      connector: new SandboxPaymentConnector({ connectorId: SANDBOX_CONNECTOR_ID }),
      organizationId: DEMO_ORGANIZATION_ID,
      proofAnchor,
      organizationSecret: resolveOrganizationSecret(),
    }),
  };

  globalWithWorkspace[WORKSPACE_KEY] = workspace;

  return workspace;
}
