import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clubs } from "@/db/schema";
import { AppShell } from "@/components/app-shell";
import { ROLE_LABELS } from "@/lib/constants";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, user.clubId)).limit(1);

  return (
    <AppShell
      clubName={club?.name ?? "Đội bóng"}
      logoUrl={club?.logoUrl ? `/api/club-assets/logo?v=${club.updatedAt.getTime()}` : null}
      userName={user.displayName}
      userId={user.id}
      userMemberId={user.memberId}
      userAvatarVersion={user.avatarUpdatedAt}
      roleLabel={ROLE_LABELS[user.role]}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
