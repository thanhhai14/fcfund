"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeSearch } from "./collection-controls";
import { Icon } from "./icon";

export type MemberSelectOption = {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
};

export function SearchableMemberSelect({
  name,
  options,
  label = "Thành viên",
  placeholder = "Nhập tên thành viên...",
  emptyLabel,
  defaultValue = "",
  required = false,
}: {
  name: string;
  options: MemberSelectOption[];
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const initial = options.find((option) => option.id === defaultValue);
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [query, setQuery] = useState(initial?.name ?? "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLabelElement>(null);
  const visible = useMemo(() => {
    const search = normalizeSearch(query);
    return options.filter((option) => !search || normalizeSearch(`${option.name} ${option.code ?? ""} ${option.phone ?? ""}`).includes(search)).slice(0, 30);
  }, [options, query]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function clear() {
    setSelectedId("");
    setQuery("");
    setOpen(true);
  }

  return (
    <label className="member-combobox" ref={rootRef}>
      {label}
      <input type="hidden" name={name} value={selectedId} />
      <span className="combobox-input">
        <Icon name="search" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setSelectedId(""); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required && !selectedId}
          autoComplete="off"
        />
        {(query || selectedId) && <button type="button" onClick={clear} aria-label="Xóa thành viên">×</button>}
      </span>
      {open && (
        <span className="combobox-menu">
          {emptyLabel && <button type="button" onClick={() => { setSelectedId(""); setQuery(""); setOpen(false); }}><b>{emptyLabel}</b></button>}
          {visible.map((option) => (
            <button type="button" key={option.id} onClick={() => { setSelectedId(option.id); setQuery(option.name); setOpen(false); }}>
              <b>{option.name}</b>
              {(option.code || option.phone) && <small>{[option.code, option.phone].filter(Boolean).join(" · ")}</small>}
            </button>
          ))}
          {!visible.length && <em>Không tìm thấy thành viên.</em>}
        </span>
      )}
    </label>
  );
}
