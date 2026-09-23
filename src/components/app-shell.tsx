"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icon";
import { APP_NAME } from "@/lib/constants";
import { MemberAvatar } from "./member-identity";
import { NavigationFeedback } from "./navigation-feedback";
import { PendingButton } from "./mutation-form";
import { PushNotificationPrompt } from "./push-notification-prompt";

const navItems = [
  { href: "/dashboard", label: "Tổng quan", icon: "house" },
  { href: "/members", label: "Thành viên", icon: "users" },
  { href: "/charges", label: "Khoản phải thu", icon: "coins" },
  { href: "/transactions", label: "Thu & chi", icon: "transactions" },
  { href: "/matches", label: "Trận đấu", icon: "futbol" },
  { href: "/reports", label: "Báo cáo", icon: "chart" },
  { href: "/notifications", label: "Hộp thư", icon: "bell" },
  { href: "/settings", label: "Cài đặt", icon: "settings" },
];

const mobileNavItems = [
  { href: "/dashboard", label: "Tổng quan", icon: "house" },
  { href: "/matches", label: "Trận", icon: "futbol" },
  { href: "/charges", label: "Khoản thu", icon: "coins" },
  { href: "/reports", label: "Báo cáo", icon: "chart" },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  clubName,
  logoUrl,
  userName,
  userId,
  userMemberId,
  userAvatarVersion,
  roleLabel,
  unreadNotifications,
  pushPublicKey,
  mobileNavRoutes,
  logoutAction,
}: {
  children: React.ReactNode;
  clubName: string;
  logoUrl?: string | null;
  userName: string;
  userId: string;
  userMemberId?: string | null;
  userAvatarVersion?: Date | string | number | null;
  roleLabel: string;
  unreadNotifications: number;
  pushPublicKey: string | null;
  mobileNavRoutes: string[];
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleMobileNavItems = mobileNavItems.filter((item) => mobileNavRoutes.includes(item.href));
  const mobilePrimaryActive = visibleMobileNavItems.some((item) => isActivePath(pathname, item.href));

  return (
    <div className="app-shell">
      <Suspense fallback={null}>
        <NavigationFeedback />
      </Suspense>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Link href="/dashboard" className="sidebar-brand" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl || "/trai-lang-logo.jpg"}
            alt={`Logo ${clubName}`}
            className="club-logo"
          />
          <span><strong>{clubName}</strong><small>Powered by {APP_NAME}</small></span>
        </Link>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                href={item.href}
                key={item.href}
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} /><span>{item.label}</span>{item.href === "/notifications" && unreadNotifications > 0 && <b className="notification-badge">{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-user">
          {userMemberId ? <Link href={`/members/${userMemberId}`} className="sidebar-profile-link" onClick={() => setOpen(false)} title="Mở hồ sơ cá nhân">
            <MemberAvatar memberId={userMemberId} userId={userId} name={userName} avatarVersion={userAvatarVersion} className="shell-avatar" />
            <span><strong>{userName}</strong><small>{roleLabel}</small></span>
          </Link> : <>
            <MemberAvatar memberId={null} userId={userId} name={userName} avatarVersion={userAvatarVersion} className="shell-avatar" />
            <span><strong>{userName}</strong><small>{roleLabel}</small></span>
          </>}
          <form action={logoutAction}>
            <PendingButton className="" title="Đăng xuất" ariaLabel="Đăng xuất" pendingLabel="…"><Icon name="logout" /></PendingButton>
          </form>
        </div>
      </aside>
      <button
        className={`sidebar-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
        aria-label="Đóng menu"
      />
      <main className="app-main">
        <Link href="/notifications" className="notification-shortcut" aria-label={`Hộp thư, ${unreadNotifications} thông báo chưa đọc`}><Icon name="bell" />{unreadNotifications > 0 && <b>{unreadNotifications > 99 ? "99+" : unreadNotifications}</b>}</Link>
        <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Mở menu">
          <Icon name="menu" />
        </button>
        {children}
      </main>

      <PushNotificationPrompt publicKey={pushPublicKey} />

      <nav className="mobile-bottom-nav" aria-label="Điều hướng chính trên điện thoại">
        {visibleMobileNavItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              href={item.href}
              key={item.href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={open || !mobilePrimaryActive ? "active" : ""}
          onClick={() => setOpen(true)}
          aria-label="Mở thêm chức năng"
          aria-expanded={open}
        >
          <Icon name="menu" />
          <span>Thêm</span>
        </button>
      </nav>
    </div>
  );
}
