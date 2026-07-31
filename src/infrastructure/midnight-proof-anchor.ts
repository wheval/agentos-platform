import type {
  AnchorSubmission,
  DecisionAnchorRequest,
  PolicyProofAnchor,
  PolicyRegistration,
} from "@/application/ports/policy-proof";
import type { ProofNetwork } from "@/domain/schemas";

/**
 * The Midnight adapter for the policy anchor.
 *
 * Everything here is real except the last inch: config parsing, the refusal
 * rules, and the mapping from a submission result to an anchor state all run in
 * production. The single piece that talks to a node is isolated behind
 * `MidnightTransactionSubmitter`, because submitting a Compact transaction
 * requires a proof server, a funded wallet and the compiled circuit keys from
 * `contracts/managed/policy-anchor`, none of which can be stood up inside this
 * repository's test environment.
 *
 * The rule this adapter exists to enforce: when it cannot anchor, it says so.
 * It never returns a transaction hash it did not receive from a node.
 */

export type MidnightConfig = {
  network: "midnight-testnet" | "midnight-mainnet";
  indexerUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
  contractAddress: string;
};

export type MidnightSubmissionResult = {
  transactionHash: string;
  confirmed: boolean;
};

/**
 * The seam a real deployment implements with `@midnight-ntwrk/midnight-js-*`
 * and the compiled circuit keys. Kept narrow on purpose: an implementation
 * receives commitments only and can never see credential material.
 */
export interface MidnightTransactionSubmitter {
  submitRegisterPolicy(
    config: MidnightConfig,
    registration: PolicyRegistration,
  ): Promise<MidnightSubmissionResult>;

  submitAnchorDecision(
    config: MidnightConfig,
    request: DecisionAnchorRequest,
  ): Promise<MidnightSubmissionResult>;
}

export type MidnightConfigResult =
  | { configured: true; config: MidnightConfig }
  | { configured: false; missing: string[] };

const REQUIRED_VARS = [
  "AGENTOS_MIDNIGHT_NETWORK",
  "AGENTOS_MIDNIGHT_INDEXER_URL",
  "AGENTOS_MIDNIGHT_NODE_URL",
  "AGENTOS_MIDNIGHT_PROOF_SERVER_URL",
  "AGENTOS_MIDNIGHT_CONTRACT_ADDRESS",
] as const;

export function readMidnightConfig(
  env: Record<string, string | undefined>,
): MidnightConfigResult {
  const missing = REQUIRED_VARS.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    return { configured: false, missing: [...missing] };
  }

  const network = env.AGENTOS_MIDNIGHT_NETWORK?.trim();

  if (network !== "midnight-testnet" && network !== "midnight-mainnet") {
    return { configured: false, missing: ["AGENTOS_MIDNIGHT_NETWORK"] };
  }

  return {
    configured: true,
    config: {
      network,
      indexerUrl: env.AGENTOS_MIDNIGHT_INDEXER_URL!.trim(),
      nodeUrl: env.AGENTOS_MIDNIGHT_NODE_URL!.trim(),
      proofServerUrl: env.AGENTOS_MIDNIGHT_PROOF_SERVER_URL!.trim(),
      contractAddress: env.AGENTOS_MIDNIGHT_CONTRACT_ADDRESS!.trim(),
    },
  };
}

export class MidnightProofAnchor implements PolicyProofAnchor {
  readonly network: ProofNetwork;
  readonly status: "ready" | "unconfigured";
  readonly description: string;

  #config: MidnightConfig | undefined;
  #submitter: MidnightTransactionSubmitter | undefined;
  #unavailableReason: string;

  constructor(options: {
    config: MidnightConfigResult;
    submitter?: MidnightTransactionSubmitter;
  }) {
    if (!options.config.configured) {
      this.network = "midnight-testnet";
      this.status = "unconfigured";
      this.#unavailableReason = `midnight_not_configured:${options.config.missing.join(",")}`;
      this.description = `Midnight anchoring is off. Set ${options.config.missing.join(", ")} to enable it.`;
      return;
    }

    this.network = options.config.config.network;
    this.#config = options.config.config;
    this.#submitter = options.submitter;

    if (!options.submitter) {
      this.status = "unconfigured";
      this.#unavailableReason = "midnight_submitter_not_installed";
      this.description =
        "Midnight is configured but no transaction submitter is installed. Compile contracts/policy-anchor.compact and register a submitter to start anchoring.";
      return;
    }

    this.status = "ready";
    this.#unavailableReason = "";
    this.description = `Anchoring decisions to ${this.network} at ${options.config.config.contractAddress}.`;
  }

  async registerPolicy(
    registration: PolicyRegistration,
  ): Promise<AnchorSubmission> {
    const ready = this.#ready();
    if (!ready.ok) return ready.failure;

    return this.#submit(() =>
      ready.submitter.submitRegisterPolicy(ready.config, registration),
    );
  }

  async anchorDecision(
    request: DecisionAnchorRequest,
  ): Promise<AnchorSubmission> {
    const ready = this.#ready();
    if (!ready.ok) return ready.failure;

    return this.#submit(() =>
      ready.submitter.submitAnchorDecision(ready.config, request),
    );
  }

  #ready():
    | { ok: true; config: MidnightConfig; submitter: MidnightTransactionSubmitter }
    | { ok: false; failure: AnchorSubmission } {
    if (!this.#config || !this.#submitter) {
      return {
        ok: false,
        failure: {
          accepted: false,
          network: this.network,
          reason: this.#unavailableReason,
        },
      };
    }

    return { ok: true, config: this.#config, submitter: this.#submitter };
  }

  async #submit(
    run: () => Promise<MidnightSubmissionResult>,
  ): Promise<AnchorSubmission> {
    try {
      const result = await run();

      return {
        accepted: true,
        network: this.network,
        state: result.confirmed ? "confirmed" : "submitted",
        transactionHash: result.transactionHash,
      };
    } catch (error) {
      return {
        accepted: false,
        network: this.network,
        reason:
          error instanceof Error
            ? `midnight_submission_failed:${error.message}`
            : "midnight_submission_failed",
      };
    }
  }
}

export function createMidnightProofAnchor(
  env: Record<string, string | undefined>,
  submitter?: MidnightTransactionSubmitter,
): MidnightProofAnchor {
  return new MidnightProofAnchor({ config: readMidnightConfig(env), submitter });
}
