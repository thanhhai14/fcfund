"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

export function InfoTooltip({ content, label = "Xem thông tin" }: { content: string | null; label?: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, above: false });

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.bottom + 150 > window.innerHeight;
      setPosition({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(12, Math.min(window.innerWidth - 292, rect.left + rect.width / 2 - 140)),
        above,
      });
    }
    function close(event: PointerEvent) {
      if (!triggerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const tooltip = typeof document !== "undefined" && open ? createPortal(
    <span id={id} role="tooltip" className={`info-tooltip-popover ${position.above ? "above" : ""}`} style={{ top: position.top, left: position.left }}>
      {content?.trim() || "Thành viên chưa cập nhật phần giới thiệu bản thân."}
    </span>,
    document.body,
  ) : null;

  return <>
    <span
      ref={triggerRef}
      className={`info-tooltip-trigger ${content?.trim() ? "has-content" : "empty"}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }
        if (event.key === "Escape") setOpen(false);
      }}
    ><Icon name="info" /></span>
    {tooltip}
  </>;
}
