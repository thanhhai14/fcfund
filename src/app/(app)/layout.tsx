import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { clubs, notificationEvents } from "@/db/schema";
import { AppShell } from "@/components/app-shell";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, user.clubId)).limit(1);
  const [unread] = await db.select({ count: sql<number>`count(*)` }).from(notificationEvents).where(and(eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.userId, user.id), isNull(notificationEvents.readAt), ne(notificationEvents.type, "TEST_NOTIFICATION")));
  const [canDashboard, canMatches, canChargesOwn, canChargesAll, canViewOtherBalances] = await Promise.all([
    can(PERMISSIONS.DASHBOARD_VIEW),
    can(PERMISSIONS.MATCHES_VIEW),
    can(PERMISSIONS.CHARGES_VIEW_OWN),
    can(PERMISSIONS.CHARGES_VIEW_ALL),
    can(PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW),
  ]);
  const mobileNavRoutes = [
    canDashboard ? "/dashboard" : null,
    canMatches ? "/matches" : null,
    canChargesOwn || canChargesAll ? "/charges" : null,
    canViewOtherBalances || user.memberId ? "/reports" : null,
  ].filter((route): route is string => Boolean(route));

  return (
    <>
      <InAppBrowserGate />
      <PwaInstallPrompt />
      <AppShell
        clubName={club?.name ?? "Đội bóng"}
        logoUrl={club?.logoUrl ? `/api/club-assets/logo?v=${club.updatedAt.getTime()}` : null}
        userName={user.displayName}
        userId={user.id}
        userMemberId={user.memberId}
        userAvatarVersion={user.avatarUpdatedAt}
        roleLabel={ROLE_LABELS[user.role]}
        unreadNotifications={Number(unread?.count ?? 0)}
        pushPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        mobileNavRoutes={mobileNavRoutes}
        logoutAction={logoutAction}
      >
        {children}
      </AppShell>
    </>
  );
}
