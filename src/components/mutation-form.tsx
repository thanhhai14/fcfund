"use client";

import { useActionState } from "react";

type Result = { ok: boolean; message: string };

export function MutationForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_state: Result | null, formData: FormData) => action(formData),
    null,
  );

  return (
    <form action={formAction} className={className}>
      {children}
      <div aria-live="polite">
        {state && <p className={`form-message ${state.ok ? "success" : "error"}`}>{state.message}</p>}
      </div>
      <input type="hidden" name="_pending" value={pending ? "1" : "0"} />
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  return <button className={`button ${variant}`} type="submit">{children}</button>;
}
