import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { notificationEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export default async function OpenPushNotificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/notifications");

  const destination = `/n/event/${id}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const [event] = await db.select({
    id: notificationEvents.id,
    url: notificationEvents.url,
    entityType: notificationEvents.entityType,
    entityId: notificationEvents.entityId,
  }).from(notificationEvents).where(and(
    eq(notificationEvents.id, id),
    eq(notificationEvents.userId, user.id),
    eq(notificationEvents.clubId, user.clubId),
  )).limit(1);

  if (!event) redirect("/notifications");

  const now = new Date();
  await db.update(notificationEvents)
    .set({ readAt: now, updatedAt: now })
    .where(and(
      eq(notificationEvents.id, event.id),
      eq(notificationEvents.userId, user.id),
      eq(notificationEvents.clubId, user.clubId),
      isNull(notificationEvents.readAt),
    ));

  const safeUrl = event.entityType === "debt_reminder" && event.entityId
    ? `/notifications/${event.entityId}`
    : event.url;
  redirect(safeUrl.startsWith("/") && !safeUrl.startsWith("//") ? safeUrl : "/notifications");
}
