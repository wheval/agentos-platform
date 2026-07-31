import type { CapabilityGrant, Currency } from "@/domain/schemas";

/**
 * The boundary between AgentOS and a system that can actually move value.
 *
 * A connector runs on the privileged side of the vault boundary. It receives a
 * capability grant — a bounded, expiring, revocable authorization — and never a
 * long-lived credential belonging to the organization. The agent that requested
 * the action never crosses this boundary at all.
 *
 * The only adapter shipped today is a sandbox that settles nothing. Real rails
 * are deliberately out of scope until custody is handled by a dedicated vault.
 */
export type ConnectorExecutionRequest = {
  capability: CapabilityGrant;
  amountMinor: number;
  currency: Currency;
  counterpartyId: string;
  /**
   * Supplied by the caller so a retried network request settles at most once.
   */
  idempotencyKey: string;
  requestedAt: string;
};

export type ConnectorExecutionResult =
  | {
      outcome: "succeeded";
      externalReference: string;
      settledAmountMinor: number;
    }
  | {
      outcome: "failed";
      failureCode: string;
      failureMessage: string;
    };

export interface PaymentConnector {
  readonly connectorId: string;
  execute(request: ConnectorExecutionRequest): Promise<ConnectorExecutionResult>;
}
