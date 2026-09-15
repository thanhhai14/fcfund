"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

export function InfoTooltip({ content, label = "Xem thông tin", children, className = "" }: { content: string | null; label?: string; children?: ReactNode; className?: string }) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, above: false, maxHeight: 220 });

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = window.innerHeight - rect.bottom < 220 && rect.top > window.innerHeight - rect.bottom;
      setPosition({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(12, Math.min(window.innerWidth - 292, rect.left + rect.width / 2 - 140)),
        above,
        maxHeight: Math.max(100, above ? rect.top - 20 : window.innerHeight - rect.bottom - 20),
      });
    }
    function close(event: PointerEvent) {
      if (!triggerRef.current?.contains(event.target as Node) && !tooltipRef.current?.contains(event.target as Node)) setOpen(false);
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

  function cancelClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const tooltip = typeof document !== "undefined" && open ? createPortal(
    <span ref={tooltipRef} id={id} role="tooltip" className={`info-tooltip-popover ${position.above ? "above" : ""}`} style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      {content?.trim() || "Thành viên chưa cập nhật phần giới thiệu bản thân."}
    </span>,
    document.body,
  ) : null;

  return <>
    <span
      ref={triggerRef}
      className={`info-tooltip-trigger ${content?.trim() ? "has-content" : "empty"} ${className}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
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
    >{children ?? <Icon name="info" />}</span>
    {tooltip}
  </>;
}
