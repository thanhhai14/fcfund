"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

export type CollectionView = "list" | "card";

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi").trim();
}

export function useResponsiveView(storageKey: string, allowToggle = true) {
  const [view, setViewState] = useState<CollectionView>("list");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = allowToggle ? window.localStorage.getItem(storageKey) : null;
      if (window.matchMedia("(max-width: 1024px)").matches) setViewState("card");
      else if (stored === "list" || stored === "card") setViewState(stored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [allowToggle, storageKey]);

  function setView(next: CollectionView) {
    setViewState(next);
    if (allowToggle) window.localStorage.setItem(storageKey, next);
  }

  return [view, setView] as const;
}

export function CollectionToolbar({
  query,
  onQueryChange,
  placeholder = "Tìm kiếm...",
  count,
  countLabel,
  children,
  view,
  onViewChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  count: number;
  countLabel?: string;
  children?: React.ReactNode;
  view?: CollectionView;
  onViewChange?: (view: CollectionView) => void;
}) {
  return (
    <div className="collection-toolbar">
      <label className="collection-search">
        <Icon name="search" />
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} />
      </label>
      <div className="collection-filters">{children}</div>
      <span className="collection-count">{countLabel ?? `${count} kết quả`}</span>
      {view && onViewChange && (
        <div className="view-toggle" aria-label="Kiểu hiển thị">
          <button type="button" className={view === "list" ? "active" : ""} onClick={() => onViewChange("list")} title="Danh sách"><Icon name="list" /><span>List</span></button>
          <button type="button" className={view === "card" ? "active" : ""} onClick={() => onViewChange("card")} title="Thẻ"><Icon name="grid" /><span>Card</span></button>
        </div>
      )}
    </div>
  );
}
