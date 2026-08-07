import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, avatars, members, users } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { addCommentAction } from "@/app/(app)/mutations";
import { MemberIdentity } from "./member-identity";

const actionLabels = {
  CREATE: "đã tạo",
  UPDATE: "đã cập nhật",
  DELETE: "đã xóa",
  RESTORE: "đã khôi phục",
  RESET_PASSWORD: "đã đặt lại mật khẩu",
  COMMENT: "đã bình luận",
};

export async function Chatter({
  clubId,
  entityType,
  entityId,
  path,
}: {
  clubId: string;
  entityType: string;
  entityId: string;
  path: string;
}) {
  const logs = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      message: activityLogs.message,
      createdAt: activityLogs.createdAt,
      actorDisplayName: users.displayName,
      actorName: members.fullName,
      actorPhone: users.phoneNormalized,
      actorMemberId: users.memberId,
      avatarUpdatedAt: avatars.updatedAt,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.actorId, users.id))
    .leftJoin(members, eq(users.memberId, members.id))
    .leftJoin(avatars, eq(users.id, avatars.userId))
    .where(
      and(
        eq(activityLogs.clubId, clubId),
        eq(activityLogs.entityType, entityType),
        eq(activityLogs.entityId, entityId),
      ),
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(30);

  return (
    <section className="chatter">
      <div className="panel-heading">
        <div><span className="eyebrow">Tracking log</span><h2>Chatter</h2></div>
      </div>
      <form action={addCommentAction} className="comment-form">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="path" value={path} />
        <input name="message" placeholder="Thêm ghi chú..." required />
        <button className="button secondary small">Gửi</button>
      </form>
      <div className="timeline">
        {logs.map((log) => (
          <div key={log.id}>
            <span className="timeline-dot" />
            <div>
              <p className="chatter-actor"><MemberIdentity memberId={log.actorMemberId} name={log.actorDisplayName ?? log.actorName ?? log.actorPhone ?? "Hệ thống"} avatarVersion={log.avatarUpdatedAt} compact /><span>{actionLabels[log.action]}</span></p>
              {log.message && <blockquote>{log.message}</blockquote>}
              <time>{formatDate(log.createdAt)} · {log.createdAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          </div>
        ))}
        {!logs.length && <p className="muted">Chưa có hoạt động.</p>}
      </div>
    </section>
  );
}
