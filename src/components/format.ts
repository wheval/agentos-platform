import type { Tone } from "@/components/ui";
import type {
  ActionRequestState,
  CapabilityGrant,
  CapabilityStatus,
  Currency,
} from "@/domain/schemas";

/** Formatting and tone mapping shared across every view. */

export function formatMoney(amountMinor: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Compact relative time, e.g. "in 14m" or "3h ago". */
export function formatRelative(iso: string, now = new Date()): string {
  const deltaSeconds = Math.round(
    (new Date(iso).getTime() - now.getTime()) / 1000,
  );
  const absolute = Math.abs(deltaSeconds);

  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absolute < 60
      ? [deltaSeconds, "second"]
      : absolute < 3600
        ? [Math.round(deltaSeconds / 60), "minute"]
        : absolute < 86_400
          ? [Math.round(deltaSeconds / 3600), "hour"]
          : [Math.round(deltaSeconds / 86_400), "day"];

  return new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(
    amount,
    unit,
  );
}

export function humanize(value: string): string {
  return value
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function requestTone(state: ActionRequestState): Tone {
  switch (state) {
    case "succeeded":
    case "approved":
      return "positive";
    case "pending_approval":
    case "executing":
    case "capability_issued":
      return "caution";
    case "denied":
    case "failed":
    case "expired":
      return "critical";
    default:
      return "neutral";
  }
}

export function capabilityTone(status: CapabilityStatus): Tone {
  switch (status) {
    case "active":
      return "positive";
    case "consumed":
      return "neutral";
    case "revoked":
    case "expired":
      return "critical";
    default:
      return "neutral";
  }
}

export function effectiveCapabilityStatus(
  capability: Pick<CapabilityGrant, "expiresAt" | "status">,
  now = new Date(),
): CapabilityStatus {
  return capability.status === "active" && new Date(capability.expiresAt) <= now
    ? "expired"
    : capability.status;
}

export function outcomeTone(outcome: "allowed" | "denied" | "info"): Tone {
  return outcome === "allowed" ? "positive" : outcome === "denied" ? "critical" : "info";
}

export function riskTone(tier: "low" | "medium" | "high"): Tone {
  return tier === "high" ? "critical" : tier === "medium" ? "caution" : "positive";
}
