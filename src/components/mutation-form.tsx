"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { ClientImageError, optimizeAvatarFile } from "@/lib/client-image";

type Result = { ok: boolean; message: string };

export function MutationForm({
  action,
  children,
  className,
  closeDisclosureOnSuccess = false,
  messageMode = "inline",
  optimizeAvatar = false,
}: {
  action: (formData: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  closeDisclosureOnSuccess?: boolean;
  messageMode?: "inline" | "alert";
  optimizeAvatar?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (_state: Result | null, formData: FormData) => {
      if (optimizeAvatar) {
        const avatar = formData.get("avatar");
        if (avatar instanceof File && avatar.size > 0) {
          try {
            const optimized = await optimizeAvatarFile(avatar);
            formData.set("avatar", optimized);
          } catch (error) {
            return {
              ok: false,
              message: error instanceof ClientImageError
                ? error.message
                : "Không thể tối ưu ảnh trên thiết bị này.",
            };
          }
        }
      }

      return action(formData);
    },
    null,
  );

  useEffect(() => {
    if (!closeDisclosureOnSuccess || !state?.ok) return;
    formRef.current?.closest("details")?.removeAttribute("open");
  }, [closeDisclosureOnSuccess, state]);

  useEffect(() => {
    if (messageMode !== "alert" || !state) return;
    window.alert(state.message);
  }, [messageMode, state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      {messageMode === "inline" && (
        <div aria-live="polite">
          {state && <p className={`form-message ${state.ok ? "success" : "error"}`}>{state.message}</p>}
        </div>
      )}
      <input type="hidden" name="_pending" value={pending ? "1" : "0"} />
    </form>
  );
}

export function PendingButton({
  children,
  className = "button primary",
  disabled = false,
  pendingLabel,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pendingLabel?: React.ReactNode;
  title?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className} submit-button`}
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      title={title}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      <span>{pending ? (pendingLabel ?? children) : children}</span>
    </button>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  disabled = false,
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  pendingLabel?: React.ReactNode;
}) {
  return (
    <PendingButton
      className={`button ${variant}`}
      disabled={disabled}
      pendingLabel={pendingLabel}
    >
      {children}
    </PendingButton>
  );
}
