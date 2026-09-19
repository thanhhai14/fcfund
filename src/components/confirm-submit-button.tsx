"use client";

import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  message,
  className = "button danger small",
  pendingLabel = "Đang xử lý…",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  pendingLabel?: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`${className} submit-button`}
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
}
