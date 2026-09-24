import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { notificationEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Icon } from "@/components/icon";
import type { NotificationChargeItem, NotificationPresentationData } from "@/lib/notification-presentation";
import { markAllNotificationsRead, openNotification } from "./actions";

export const metadata = { title: "Hộp thư" };

const filters = [
  { value: "all", label: "Tất cả" },
  { value: "unread", label: "Chưa đọc" },
  { value: "match", label: "Trận đấu" },
  { value: "fund", label: "Quỹ" },
  { value: "admin", label: "Quản trị" },
] as const;

function groupOf(type: string) {
  if (type === "ZALO_LINK_REQUEST") return "admin";
  if (type.startsWith("MATCH")) return "match";
  return "fund";
}

function NotificationMessage({ body, presentationData }: {
  body: string;
  presentationData: NotificationPresentationData | null;
}) {
  if (!presentationData || presentationData.version !== 1 || presentationData.kind !== "match_result") {
    return <>{body}</>;
  }

  const placementText = presentationData.placement === 1
    ? `Chúc mừng! ${presentationData.teamName} đạt hạng 1.`
    : `Đội của bạn (${presentationData.teamName}) đạt hạng ${presentationData.placement}.`;

  return <>
    {placementText}
    {presentationData.chargeItems.length > 0 && <>
      {" "}Khoản phạt: {presentationData.chargeItems.map((item, itemIndex) => <span key={`${item.name}-${itemIndex}`}>
        {itemIndex > 0 && ", "}
        <NotificationCharge item={item} />
      </span>)}.
    </>}
  </>;
}

function NotificationCharge({ item }: { item: NotificationChargeItem }) {
  if (!item.reportAsIcon || !item.iconName) return <>{item.quantity} {item.name}</>;
  return <span
    className="notification-result-icons"
    style={{ color: item.color ?? undefined }}
    aria-label={`${item.name} × ${item.quantity}`}
    title={`${item.name} · ${item.quantity}`}
  >{Array.from({ length: item.quantity }, (_, index) => <Icon name={item.iconName} key={index} />)}</span>;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const user = await requireUser();
  const { filter: requestedFilter } = await searchParams;
  const filter = filters.some((item) => item.value === requestedFilter) ? requestedFilter : "all";
  const [events, unreadResult] = await Promise.all([
    db.select().from(notificationEvents).where(and(eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.userId, user.id), ne(notificationEvents.type, "TEST_NOTIFICATION"), filter === "unread" ? isNull(notificationEvents.readAt) : undefined)).orderBy(desc(notificationEvents.createdAt)).limit(200),
    db.select({ count: sql<number>`count(*)` }).from(notificationEvents).where(and(eq(notificationEvents.clubId, user.clubId), eq(notificationEvents.userId, user.id), ne(notificationEvents.type, "TEST_NOTIFICATION"), isNull(notificationEvents.readAt))),
  ]);
  const unreadCount = Number(unreadResult[0]?.count ?? 0);
  const shown = events.filter((event) => filter === "unread" ? !event.readAt : filter === "all" || groupOf(event.type) === filter);

  return <section className="notification-page">
    <header className="page-header notification-page-header">
      <div><span className="eyebrow">Thông báo</span><div className="notification-heading-line"><h1>Hộp thư</h1><span className="notification-unread-count">{unreadCount} chưa đọc</span></div><p>Thông báo gửi đến tài khoản của bạn, kể cả khi chưa bật Push.</p></div>
      <form action={markAllNotificationsRead}><button type="submit" className="button secondary notification-mark-all" disabled={unreadCount === 0} title="Đánh dấu tất cả đã đọc" aria-label="Đánh dấu tất cả đã đọc"><Icon name="check" /><span>Đánh dấu tất cả đã đọc</span></button></form>
    </header>
    <article className="panel notification-inbox">
      <nav className="notification-filters" aria-label="Lọc thông báo">{filters.map((item) => <Link key={item.value} href={item.value === "all" ? "/notifications" : `/notifications?filter=${item.value}`} className={filter === item.value ? "active" : ""} aria-current={filter === item.value ? "page" : undefined}><span>{item.label}</span>{item.value === "unread" && unreadCount > 0 && <small>{unreadCount}</small>}</Link>)}</nav>
      <div className="notification-results">
        <div className="notification-results-heading"><strong>{filters.find((item) => item.value === filter)?.label}</strong><span>{shown.length} thông báo</span></div>
        {shown.length ? <ul className="notification-list">{shown.map((event) => <li key={event.id}><form action={openNotification.bind(null, event.id)}><button type="submit" className={`notification-item${event.readAt ? "" : " unread"}`}><span className="notification-item-icon"><Icon name={groupOf(event.type) === "match" ? "futbol" : groupOf(event.type) === "admin" ? "settings" : "bell"} /></span><span className="notification-item-copy"><span className="notification-item-title"><strong>{event.title}</strong>{!event.readAt && <span className="notification-unread-dot"><span className="sr-only">Chưa đọc</span></span>}</span><span className="notification-item-body"><NotificationMessage body={event.body} presentationData={event.presentationData} /></span></span><time className="notification-item-time" dateTime={event.createdAt.toISOString()}>{formatDateTime(event.createdAt)}</time></button></form></li>)}</ul> : <div className="notification-empty"><Icon name="bell" /><strong>{filter === "unread" ? "Bạn đã đọc hết thông báo" : "Chưa có thông báo ở mục này"}</strong><p>{filter === "all" ? "Thông báo mới sẽ xuất hiện tại đây." : "Bạn có thể xem các thông báo khác trong Hộp thư."}</p>{filter !== "all" && <Link className="button secondary small" href="/notifications">Xem tất cả</Link>}</div>}
      </div>
    </article>
  </section>;
}
