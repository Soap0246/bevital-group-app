"use client";

import { useActionState, type ReactNode } from "react";
import { buttonClass } from "./ui";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * <form> wired to a Server Action with pending state and inline success / error feedback.
 * Server Actions must (re)verify the caller is an admin — see requireAdmin().
 */
export function ActionForm({
  action, children, submitLabel = "Save", variant = "primary", className = "space-y-4", confirm, hideSubmit,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel?: string;
  variant?: "primary" | "danger" | "secondary" | "outline";
  className?: string;
  /** native confirm() prompt before submitting (destructive actions) */
  confirm?: string;
  hideSubmit?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error ? <p role="alert" className="rounded-lg bg-danger-light px-3 py-2 text-sm font-medium text-danger">{state.error}</p> : null}
      {state?.ok && state.message ? <p role="status" className="rounded-lg bg-success-light px-3 py-2 text-sm font-medium text-success">{state.message}</p> : null}
      {hideSubmit ? null : (
        <button type="submit" disabled={pending} className={buttonClass(variant)}>
          {pending ? "Working…" : submitLabel}
        </button>
      )}
    </form>
  );
}
