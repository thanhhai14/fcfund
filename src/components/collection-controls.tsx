"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";
import { Disclosure } from "./disclosure";

export type CollectionView = "list" | "card";
export type CollectionColumn = { id: string; label: string; required?: boolean; defaultVisible?: boolean };

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

export function useColumnVisibility(storageKey: string, columns: CollectionColumn[]) {
  const [hidden, setHidden] = useState<string[]>([]);
  const defaultHidden = JSON.stringify(columns.filter((column) => column.defaultVisible === false && !column.required).map((column) => column.id));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        try { setHidden(JSON.parse(stored)); } catch { setHidden([]); }
      } else setHidden(JSON.parse(defaultHidden));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultHidden, storageKey]);

  function toggle(id: string) {
    const column = columns.find((item) => item.id === id);
    if (!column || column.required) return;
    setHidden((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  return { hidden, isVisible: (id: string) => !hidden.includes(id), toggle };
}

export function ColumnVisibilityMenu({ columns, hidden, onToggle }: { columns: CollectionColumn[]; hidden: string[]; onToggle: (id: string) => void }) {
  return <Disclosure label={<><Icon name="list" /> Cột hiển thị</>} className="column-visibility-disclosure">
    <div className="column-visibility-menu">
      <strong>Chọn cột hiển thị</strong>
      {columns.map((column) => <label key={column.id}><input type="checkbox" checked={!hidden.includes(column.id)} disabled={column.required} onChange={() => onToggle(column.id)} />{column.label}{column.required && <small>Bắt buộc</small>}</label>)}
    </div>
  </Disclosure>;
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
    <div className="collection-toolbar-shell">
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
    </div>
  );
}
