"use client";

import { useEffect, useRef, useState } from "react";

export function Disclosure({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    detailsRef.current?.removeAttribute("open");
    setOpen(false);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) close();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details
      ref={detailsRef}
      className={`disclosure ${className ?? ""}`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{label}</summary>
      {open && <button type="button" className="disclosure-backdrop" onClick={close} aria-label="Đóng cửa sổ" />}
      <div className="disclosure-content">
        <button type="button" className="disclosure-close" onClick={close} aria-label="Đóng">×</button>
        {children}
      </div>
    </details>
  );
}
