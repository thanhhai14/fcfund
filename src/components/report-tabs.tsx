"use client";

import { useEffect, useState } from "react";

export type ReportTab = "monthly" | "balances" | "structure";

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "monthly", label: "Phát sinh theo tháng" },
  { id: "balances", label: "Công nợ lũy kế" },
  { id: "structure", label: "Cơ cấu lũy kế" },
];

function validTab(value: string | null): ReportTab {
  return TABS.some((tab) => tab.id === value) ? value as ReportTab : "monthly";
}

export function ReportTabs({
  initialTab,
  monthly,
  balances,
  structure,
}: {
  initialTab: ReportTab;
  monthly: React.ReactNode;
  balances: React.ReactNode;
  structure: React.ReactNode;
}) {
  const [active, setActive] = useState<ReportTab>(initialTab);

  useEffect(() => {
    function syncFromHistory() {
      setActive(validTab(new URL(window.location.href).searchParams.get("tab")));
    }
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  function selectTab(tab: ReportTab) {
    setActive(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({}, "", url);
  }

  function handleKeys(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <section className="report-tabs-shell">
      <div className="report-tabs" role="tablist" aria-label="Loại báo cáo">
        {TABS.map((tab, index) => <button
          type="button"
          role="tab"
          id={`report-tab-${tab.id}`}
          aria-controls={`report-panel-${tab.id}`}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          className={active === tab.id ? "active" : ""}
          key={tab.id}
          onClick={() => selectTab(tab.id)}
          onKeyDown={(event) => handleKeys(event, index)}
        >{tab.label}</button>)}
      </div>
      <div role="tabpanel" id="report-panel-monthly" aria-labelledby="report-tab-monthly" hidden={active !== "monthly"}>{monthly}</div>
      <div role="tabpanel" id="report-panel-balances" aria-labelledby="report-tab-balances" hidden={active !== "balances"}>{balances}</div>
      <div role="tabpanel" id="report-panel-structure" aria-labelledby="report-tab-structure" hidden={active !== "structure"}>{structure}</div>
    </section>
  );
}
