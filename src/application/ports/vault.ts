import type { CapabilityGrant } from "@/domain/schemas";

/**
 * The credential custody boundary.
 *
 * ## Status: no implementation exists.
 *
 * Nothing in this repository implements this interface, and nothing calls it.
 * It is checked in deliberately, as the documented shape of the one component
 * AgentOS does not yet have and will not hand-roll. Today `AuthorityService`
 * issues `CapabilityGrant` records that are authorization *decisions* — they
 * bound what may happen — and the sandbox connector honours them without any
 * real credential existing anywhere. That is the whole reason no real money can
 * move.
 *
 * ## Why the boundary exists at all
 *
 * The single most valuable property of the architecture is that policy
 * evaluation and secret custody are separated. The control plane decides
 * *whether* an action is permitted and under what bounds; the custody domain
 * decides *how* to materialise a credential for exactly those bounds. Neither
 * can do the other's job. Compromising the control plane yields decisions but
 * no secrets; compromising a single connector yields one short-lived, capped
 * credential rather than an organisation's payment instrument.
 *
 * That separation is only real if the custody domain is a different trust
 * domain — a different process, different host, different key material, and
 * ideally different operators. An implementation of this interface that reads
 * plaintext secrets out of the same process as the policy engine would satisfy
 * the types and defeat the entire design.
 *
 * ## What a real implementation must guarantee
 *
 * 1. **Raw credentials never cross this boundary.** `issueCapability` returns a
 *    grant, not a secret. Any usable material stays inside custody and is
 *    referenced indirectly by the connector.
 * 2. **Bounds are enforced by the issuer, not the caller.** The custody domain
 *    re-derives amount, currency, counterparty, resource and expiry limits and
 *    refuses anything wider than the approved decision. It must not trust this
 *    command object.
 * 3. **Issuance is idempotent.** Replaying `idempotencyKey` returns the same
 *    grant instead of minting a second one.
 * 4. **Keys live in an HSM or a managed KMS.** No bespoke cryptography, no
 *    application-managed key material, no secrets in environment variables that
 *    the web process can read.
 * 5. **Revocation is immediate and authoritative.** `revokeCapability` must
 *    make the credential unusable at its source, not merely mark a row.
 * 6. **Every issuance and revocation is independently logged** inside the
 *    custody domain, so the control plane's audit ledger can be reconciled
 *    against a record the control plane cannot rewrite.
 *
 * The realistic path is a managed issuer (a card-issuing or scoped-token
 * provider) behind this port rather than a vault we build. See
 * `docs/adr/0004-midnight-proof-anchoring.md` for how the proof layer relates:
 * Midnight proves a decision was policy-compliant, custody proves the resulting
 * credential was bounded. They are complementary and neither substitutes for
 * the other.
 */
export type IssueCapabilityCommand = {
  actionRequestId: string;
  agentId: string;
  idempotencyKey: string;
  scope: CapabilityGrant["scope"];
  expiresAt: string;
};

export interface VaultPort {
  issueCapability(command: IssueCapabilityCommand): Promise<CapabilityGrant>;
  revokeCapability(capabilityId: string, reason: string): Promise<void>;
}
