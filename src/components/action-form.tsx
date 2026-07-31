"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/console/actions";

/**
 * Form wrapper for operator mutations.
 *
 * The result of an action is announced in a live region rather than only
 * rendered, so an operator using a screen reader learns that an approval landed
 * without having to go hunting for the change.
 */

function SubmitButton({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();

  const styles = {
    primary: "bg-[#2f6b55] text-white hover:bg-[#255a47]",
    secondary:
      "border border-[#c9d2ca] bg-white text-[#14231f] hover:border-[#9fb3a6]",
    danger: "border border-[#eec3bf] bg-white text-[#8a2f28] hover:border-[#d99a94]",
  }[variant];

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  submitLabel,
  variant = "primary",
  className = "",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className={className}>
      {children}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitButton variant={variant}>{submitLabel}</SubmitButton>

        <p aria-live="polite" className="text-sm">
          {state.error ? (
            <span className="text-[#8a2f28]">{state.error}</span>
          ) : state.message ? (
            <span className="text-[#1f513f]">{state.message}</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-[#14231f]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[#66736e]">{hint}</span> : null}
    </label>
  );
}

export const inputClassName =
  "mt-1.5 w-full rounded-lg border border-[#c9d2ca] bg-white px-3 py-2 text-sm text-[#14231f] outline-none transition-colors focus:border-[#2f6b55]";
