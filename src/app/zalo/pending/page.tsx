import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { zaloLinkRequests } from "@/db/schema";
import { ZaloPendingStatus } from "@/components/zalo-pending-status";
import { getCurrentUser } from "@/lib/auth";
import { readZaloPendingSession } from "@/lib/zalo-linking";

export const metadata: Metadata = { title: "Chờ duyệt Zalo" };

export default async function ZaloPendingPage() {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/dashboard");

  const session = await readZaloPendingSession();
  if (!session) redirect("/login");

  const [request] = await db
    .select()
    .from(zaloLinkRequests)
    .where(and(
      eq(zaloLinkRequests.id, session.requestId),
      eq(zaloLinkRequests.providerUserId, session.providerUserId),
    ))
    .limit(1);

  if (!request) redirect("/login");

  return (
    <main className="center-page zalo-auth-page">
      <section className="panel zalo-link-card">
        <span className="eyebrow">Đăng nhập bằng Zalo</span>
        <h1>Yêu cầu vào Liên đoàn</h1>
        <div className="zalo-profile-summary">
          {request.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={request.avatarUrl} alt="" />
          )}
          <div>
            <strong>{request.displayName}</strong>
            <small>Zalo ID: {request.providerUserId}</small>
          </div>
        </div>

        <ZaloPendingStatus initialStatus={request.status} />

        {request.status === "PENDING" && (
          <p className="panel-note">
            FCFUND chưa xác định được tài khoản tương ứng. Yêu cầu đã được gửi tới tất cả Chủ Tịch Fifa.
            Bạn có thể giữ trang này mở; hệ thống sẽ tự kiểm tra khi có quyết định.
          </p>
        )}

        {request.status === "REJECTED" && (
          <p className="panel-note">
            Vui lòng liên hệ Chủ Tịch Fifa nếu bạn cho rằng yêu cầu này cần được xem lại.
          </p>
        )}

        <a className="button secondary" href="/login">Quay lại đăng nhập</a>
      </section>
    </main>
  );
}
