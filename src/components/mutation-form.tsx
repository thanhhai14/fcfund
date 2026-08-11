"use client";

import { useActionState, useEffect, useRef } from "react";

type Result = { ok: boolean; message: string };

export function MutationForm({
  action,
  children,
  className,
  closeDisclosureOnSuccess = false,
}: {
  action: (formData: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  closeDisclosureOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (_state: Result | null, formData: FormData) => action(formData),
    null,
  );

  useEffect(() => {
    if (!closeDisclosureOnSuccess || !state?.ok) return;
    formRef.current?.closest("details")?.removeAttribute("open");
  }, [closeDisclosureOnSuccess, state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
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
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  return <button className={`button ${variant}`} type="submit" disabled={disabled}>{children}</button>;
}
