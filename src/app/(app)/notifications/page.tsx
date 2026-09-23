import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { notificationEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { markAllNotificationsRead, openNotification } from "./actions";

export const metadata = { title: "Hộp thư" };

function groupOf(type: string) {
  if (type === "ZALO_LINK_REQUEST") return "admin";
  if (type.startsWith("MATCH")) return "match";
  return "fund";
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter = "all" } = await searchParams;
  const events = await db.select().from(notificationEvents).where(and(eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.userId, user.id), ne(notificationEvents.type, "TEST_NOTIFICATION"), filter === "unread" ? isNull(notificationEvents.readAt) : undefined)).orderBy(desc(notificationEvents.createdAt)).limit(200);
  const shown = events.filter((event) => !["match", "fund", "admin"].includes(filter) || groupOf(event.type) === filter);
  return <><PageHeader eyebrow="Thông báo" title="Hộp thư" description="Các thông báo gửi đến tài khoản của bạn, kể cả khi chưa bật Push." />
    <article className="panel notification-inbox"><div className="notification-inbox-top"><nav aria-label="Lọc thông báo">{[["all", "Tất cả"], ["unread", "Chưa đọc"], ["match", "Trận đấu"], ["fund", "Quỹ"], ["admin", "Quản trị"]].map(([value, label]) => <a key={value} href={value === "all" ? "/notifications" : `/notifications?filter=${value}`} className={filter === value ? "active" : ""}>{label}</a>)}</nav><form action={markAllNotificationsRead}><button type="submit" className="button secondary small">Đánh dấu tất cả đã đọc</button></form></div>
      <div className="notification-list">{shown.map((event) => <form action={openNotification.bind(null, event.id)} key={event.id}><button type="submit" className={`notification-item${event.readAt ? "" : " unread"}`}><span className="notification-item-icon"><Icon name={groupOf(event.type) === "match" ? "futbol" : groupOf(event.type) === "admin" ? "settings" : "bell"} /></span><span className="notification-item-copy"><strong>{event.title}</strong><span>{event.body}</span><small>{formatDateTime(event.createdAt)}</small></span>{!event.readAt && <i aria-label="Chưa đọc" />}</button></form>)}{!shown.length && <p className="collection-empty">Chưa có thông báo trong mục này.</p>}</div>
    </article></>;
}
