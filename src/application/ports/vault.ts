import type { CapabilityGrant } from "@/domain/schemas";

export type IssueCapabilityCommand = {
  actionRequestId: string;
  agentId: string;
  idempotencyKey: string;
  scope: CapabilityGrant["scope"];
  expiresAt: string;
};

/**
 * Trust boundary: policy services request bounded authority but never receive
 * long-lived credentials. A production adapter must run in an isolated custody
 * domain and return only a connector-usable capability reference.
 */
export interface VaultPort {
  issueCapability(command: IssueCapabilityCommand): Promise<CapabilityGrant>;
  revokeCapability(capabilityId: string, reason: string): Promise<void>;
}
