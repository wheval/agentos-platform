import type {
  ConnectorExecutionRequest,
  ConnectorExecutionResult,
  PaymentConnector,
} from "@/application/ports/payment-connector";
import { createHash } from "node:crypto";

export type SandboxPaymentConnectorOptions = {
  connectorId: string;
  /**
   * Percentage of executions that fail, selected deterministically from the
   * idempotency key so a given request always produces the same outcome.
   * Defaults to zero so demos and tests are stable unless failure is the point.
   */
  failureRatePercent?: number;
};

/**
 * A payment connector that settles nothing.
 *
 * No money moves. There is no acquirer, no card network and no ledger behind
 * this adapter — it exists so the authority lifecycle can be exercised end to
 * end without AgentOS taking custody of anything. Every response is derived
 * deterministically from the idempotency key, which also makes replay behaviour
 * observable in tests.
 */
export class SandboxPaymentConnector implements PaymentConnector {
  readonly connectorId: string;
  readonly #failureRatePercent: number;

  constructor(options: SandboxPaymentConnectorOptions) {
    this.connectorId = options.connectorId;
    this.#failureRatePercent = clampPercent(options.failureRatePercent ?? 0);
  }

  async execute(
    request: ConnectorExecutionRequest,
  ): Promise<ConnectorExecutionResult> {
    const digest = createHash("sha256")
      .update(`${this.connectorId}:${request.idempotencyKey}`, "utf8")
      .digest("hex");
    const bucket = Number.parseInt(digest.slice(0, 4), 16) % 100;

    if (bucket < this.#failureRatePercent) {
      return {
        outcome: "failed",
        failureCode: "sandbox_declined",
        failureMessage:
          "Sandbox connector declined this execution. No value moved.",
      };
    }

    return {
      outcome: "succeeded",
      externalReference: `sbx_${digest.slice(0, 16)}`,
      settledAmountMinor: request.amountMinor,
    };
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;

  return Math.min(100, Math.max(0, Math.trunc(value)));
}
