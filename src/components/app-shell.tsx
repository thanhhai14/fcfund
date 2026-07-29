"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";

const navItems = [
  { href: "/dashboard", label: "Tổng quan", icon: "house" },
  { href: "/members", label: "Thành viên", icon: "users" },
  { href: "/charges", label: "Khoản phải thu", icon: "coins" },
  { href: "/transactions", label: "Thu & chi", icon: "transactions" },
  { href: "/matches", label: "Trận đấu", icon: "futbol" },
  { href: "/reports", label: "Báo cáo", icon: "chart" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
];

export function AppShell({
  children,
  clubName,
  logoUrl,
  userName,
  roleLabel,
  logoutAction,
}: {
  children: React.ReactNode;
  clubName: string;
  logoUrl?: string | null;
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/dashboard" className="sidebar-brand" onClick={() => setOpen(false)}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="club-logo" />
          ) : (
            <span className="brand-badge">FC</span>
          )}
          <span><strong>{clubName}</strong><small>Powered by FCFUND</small></span>
        </Link>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                href={item.href}
                key={item.href}
                className={active ? "active" : ""}
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} /><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{userName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{userName}</strong><small>{roleLabel}</small></span>
          <form action={logoutAction}>
            <button title="Đăng xuất"><Icon name="logout" /></button>
          </form>
        </div>
      </aside>
      <button
        className={`sidebar-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
        aria-label="Đóng menu"
      />
      <main className="app-main">
        <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Mở menu">
          <Icon name="menu" />
        </button>
        {children}
      </main>
    </div>
  );
}
