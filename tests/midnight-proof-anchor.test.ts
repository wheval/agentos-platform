import type {
  DecisionAnchorRequest,
  PolicyRegistration,
} from "@/application/ports/policy-proof";
import { LocalCommitmentAnchor } from "@/infrastructure/local-commitment-anchor";
import {
  MidnightProofAnchor,
  createMidnightProofAnchor,
  readMidnightConfig,
  type MidnightConfig,
  type MidnightSubmissionResult,
  type MidnightTransactionSubmitter,
} from "@/infrastructure/midnight-proof-anchor";
import { describe, expect, it } from "vitest";

const COMPLETE_ENV = {
  AGENTOS_MIDNIGHT_NETWORK: "midnight-testnet",
  AGENTOS_MIDNIGHT_INDEXER_URL: "https://indexer.example",
  AGENTOS_MIDNIGHT_NODE_URL: "https://node.example",
  AGENTOS_MIDNIGHT_PROOF_SERVER_URL: "http://localhost:6300",
  AGENTOS_MIDNIGHT_CONTRACT_ADDRESS: "0200abcdef",
} satisfies Record<string, string>;

const registration: PolicyRegistration = {
  policyId: "pol_vendor_payment",
  policyCommitment: "a".repeat(64),
};

const decision: DecisionAnchorRequest = {
  organizationId: "org_test",
  actionRequestId: "req_invoice_1048",
  policyId: "pol_vendor_payment",
  policyCommitment: "a".repeat(64),
  decisionNullifier: "b".repeat(64),
  outcome: "approved",
};

class StubSubmitter implements MidnightTransactionSubmitter {
  readonly calls: string[] = [];

  constructor(private readonly result: MidnightSubmissionResult | Error) {}

  async submitRegisterPolicy(config: MidnightConfig): Promise<MidnightSubmissionResult> {
    this.calls.push(`register:${config.contractAddress}`);

    return this.#respond();
  }

  async submitAnchorDecision(config: MidnightConfig): Promise<MidnightSubmissionResult> {
    this.calls.push(`anchor:${config.contractAddress}`);

    return this.#respond();
  }

  #respond(): MidnightSubmissionResult {
    if (this.result instanceof Error) throw this.result;

    return this.result;
  }
}

describe("readMidnightConfig", () => {
  it("accepts a complete environment", () => {
    const result = readMidnightConfig(COMPLETE_ENV);

    expect(result.configured).toBe(true);
    expect(result.configured && result.config.network).toBe("midnight-testnet");
    expect(result.configured && result.config.contractAddress).toBe("0200abcdef");
  });

  it("names every missing variable", () => {
    const result = readMidnightConfig({});

    expect(result.configured).toBe(false);
    expect(result.configured === false && result.missing).toEqual([
      "AGENTOS_MIDNIGHT_NETWORK",
      "AGENTOS_MIDNIGHT_INDEXER_URL",
      "AGENTOS_MIDNIGHT_NODE_URL",
      "AGENTOS_MIDNIGHT_PROOF_SERVER_URL",
      "AGENTOS_MIDNIGHT_CONTRACT_ADDRESS",
    ]);
  });

  it("treats a blank variable as missing", () => {
    const result = readMidnightConfig({
      ...COMPLETE_ENV,
      AGENTOS_MIDNIGHT_NODE_URL: "   ",
    });

    expect(result.configured === false && result.missing).toEqual([
      "AGENTOS_MIDNIGHT_NODE_URL",
    ]);
  });

  it("rejects an unrecognised network rather than guessing", () => {
    const result = readMidnightConfig({
      ...COMPLETE_ENV,
      AGENTOS_MIDNIGHT_NETWORK: "midnight-devnet",
    });

    expect(result.configured === false && result.missing).toEqual([
      "AGENTOS_MIDNIGHT_NETWORK",
    ]);
  });
});

describe("MidnightProofAnchor when it cannot anchor", () => {
  it("refuses to anchor without configuration and says which variables are missing", async () => {
    const anchor = createMidnightProofAnchor({});

    expect(anchor.status).toBe("unconfigured");

    const result = await anchor.anchorDecision(decision);

    expect(result.accepted).toBe(false);
    expect(result.accepted === false && result.reason).toContain(
      "midnight_not_configured",
    );
    expect(result).not.toHaveProperty("transactionHash");
  });

  it("refuses to anchor when configured but no submitter is installed", async () => {
    const anchor = createMidnightProofAnchor(COMPLETE_ENV);

    expect(anchor.status).toBe("unconfigured");
    expect(anchor.network).toBe("midnight-testnet");

    const result = await anchor.registerPolicy(registration);

    expect(result.accepted).toBe(false);
    expect(result.accepted === false && result.reason).toBe(
      "midnight_submitter_not_installed",
    );
  });

  it("reports a submission failure instead of fabricating a hash", async () => {
    const anchor = new MidnightProofAnchor({
      config: readMidnightConfig(COMPLETE_ENV),
      submitter: new StubSubmitter(new Error("node unreachable")),
    });

    const result = await anchor.anchorDecision(decision);

    expect(result.accepted).toBe(false);
    expect(result.accepted === false && result.reason).toBe(
      "midnight_submission_failed:node unreachable",
    );
  });
});

describe("MidnightProofAnchor when it can anchor", () => {
  it("returns the hash the submitter reported", async () => {
    const submitter = new StubSubmitter({
      transactionHash: "0xfeed",
      confirmed: false,
    });
    const anchor = new MidnightProofAnchor({
      config: readMidnightConfig(COMPLETE_ENV),
      submitter,
    });

    expect(anchor.status).toBe("ready");

    const result = await anchor.anchorDecision(decision);

    expect(result).toEqual({
      accepted: true,
      network: "midnight-testnet",
      state: "submitted",
      transactionHash: "0xfeed",
    });
    expect(submitter.calls).toEqual(["anchor:0200abcdef"]);
  });

  it("marks a confirmed submission as confirmed", async () => {
    const anchor = new MidnightProofAnchor({
      config: readMidnightConfig(COMPLETE_ENV),
      submitter: new StubSubmitter({ transactionHash: "0xbeef", confirmed: true }),
    });

    const result = await anchor.registerPolicy(registration);

    expect(result.accepted === true && result.state).toBe("confirmed");
  });
});

describe("LocalCommitmentAnchor", () => {
  it("refuses a decision whose policy was never registered", async () => {
    const anchor = new LocalCommitmentAnchor();
    const result = await anchor.anchorDecision(decision);

    expect(result.accepted).toBe(false);
    expect(result.accepted === false && result.reason).toBe("policy_not_registered");
  });

  it("accepts a registered policy's decision but never claims to be a chain", async () => {
    const anchor = new LocalCommitmentAnchor();

    expect(anchor.network).toBe("local");
    expect(anchor.status).toBe("ready");

    expect((await anchor.registerPolicy(registration)).accepted).toBe(true);

    const result = await anchor.anchorDecision(decision);

    expect(result.accepted).toBe(true);
    expect(result.accepted === true && result.state).toBe("recorded");
    expect(result).not.toHaveProperty("transactionHash");
  });
});
