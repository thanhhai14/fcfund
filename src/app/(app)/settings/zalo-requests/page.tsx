/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  authIdentities,
  members,
  users,
  zaloLinkRequests,
} from "@/db/schema";
import { Disclosure } from "@/components/disclosure";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import {
  approveExistingZaloRequestAction,
  createMemberAndApproveZaloRequestAction,
  rejectZaloRequestAction,
} from "./actions";

export const metadata: Metadata = { title: "Yêu cầu Zalo" };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(value);
}

export default async function ZaloRequestsPage() {
  const actor = await requireUser();
  if (actor.role !== "ADMIN") redirect("/settings");

  const [requests, availableUsers] = await Promise.all([
    db
      .select()
      .from(zaloLinkRequests)
      .where(eq(zaloLinkRequests.clubId, actor.clubId))
      .orderBy(desc(zaloLinkRequests.createdAt))
      .limit(100),
    db
      .select({
        id: users.id,
        displayName: users.displayName,
        phone: users.phoneNormalized,
        role: users.role,
        memberName: members.fullName,
      })
      .from(users)
      .leftJoin(members, eq(users.memberId, members.id))
      .leftJoin(authIdentities, and(
        eq(authIdentities.userId, users.id),
        eq(authIdentities.provider, "ZALO"),
      ))
      .where(and(
        eq(users.clubId, actor.clubId),
        eq(users.isActive, true),
        isNull(authIdentities.id),
      ))
      .orderBy(users.displayName),
  ]);

  const pendingCount = requests.filter((item) => item.status === "PENDING").length;

  return (
    <>
      <PageHeader
        eyebrow="Chủ Tịch Fifa"
        title="Yêu cầu liên kết Zalo"
        description={String(pendingCount) + " yêu cầu đang chờ duyệt"}
      />

      <div className="zalo-admin-toolbar">
        <Link className="button secondary" href="/settings">← Quay lại Cài đặt</Link>
      </div>

      <section className="stack zalo-request-list">
        {!requests.length && (
          <article className="panel">
            <h2>Chưa có yêu cầu Zalo</h2>
            <p className="panel-note">Các Zalo ID không tự xác định được thành viên sẽ xuất hiện tại đây.</p>
          </article>
        )}

        {requests.map((request) => (
          <article className={"panel zalo-request-card " + request.status.toLowerCase()} key={request.id}>
            <div className="zalo-request-head">
              <div className="zalo-profile-summary">
                {request.avatarUrl && <img src={request.avatarUrl} alt="" />}
                <div>
                  <span className="eyebrow">{request.status}</span>
                  <h2>{request.displayName}</h2>
                  <small>Zalo ID: {request.providerUserId}</small>
                  <small>Gửi lúc: {formatDate(request.createdAt)}</small>
                </div>
              </div>
              <span className={"status-pill " + request.status.toLowerCase()}>{request.status}</span>
            </div>

            {request.status === "PENDING" ? (
              <div className="zalo-request-actions-grid">
                <article className="zalo-request-action-box">
                  <h3>Link vào user hiện có</h3>
                  {availableUsers.length ? (
                    <MutationForm action={approveExistingZaloRequestAction} className="form-stack">
                      <input type="hidden" name="requestId" value={request.id} />
                      <label>
                        User FCFUND chưa link Zalo
                        <select name="userId" required defaultValue="">
                          <option value="" disabled>Chọn user…</option>
                          {availableUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.displayName} · {user.phone} · {ROLE_LABELS[user.role]}
                              {user.memberName ? " · " + user.memberName : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <SubmitButton pendingLabel="Đang duyệt…">Duyệt & liên kết</SubmitButton>
                    </MutationForm>
                  ) : (
                    <p className="panel-note">Không còn user active chưa link Zalo.</p>
                  )}
                </article>

                <article className="zalo-request-action-box">
                  <h3>Tạo thành viên mới</h3>
                  <Disclosure label="+ Tạo member + user" className="inline-disclosure">
                    <MutationForm action={createMemberAndApproveZaloRequestAction} className="form-stack">
                      <input type="hidden" name="requestId" value={request.id} />
                      <label>Họ tên<input name="fullName" defaultValue={request.displayName} required /></label>
                      <label>Mã thành viên<input name="code" placeholder="Để trống để tự sinh" /></label>
                      <label>Số điện thoại<input name="phone" inputMode="numeric" pattern="[0-9]*" required /></label>
                      <label>
                        Vai trò
                        <select name="role" defaultValue="MEMBER">
                          <option value="MEMBER">Thành viên</option>
                          <option value="ORGANIZER">Người tổ chức</option>
                          <option value="TREASURER">Thủ quỹ</option>
                        </select>
                      </label>
                      <p className="panel-note">
                        Hệ thống tạo member + user + Zalo identity trong một transaction.
                      </p>
                      <SubmitButton pendingLabel="Đang tạo…">Tạo & duyệt</SubmitButton>
                    </MutationForm>
                  </Disclosure>
                </article>

                <article className="zalo-request-action-box danger-zone">
                  <h3>Từ chối yêu cầu</h3>
                  <MutationForm action={rejectZaloRequestAction} className="form-stack">
                    <input type="hidden" name="requestId" value={request.id} />
                    <label>Lý do<textarea name="reason" rows={3} maxLength={500} placeholder="Không bắt buộc" /></label>
                    <SubmitButton variant="danger" pendingLabel="Đang từ chối…">Từ chối</SubmitButton>
                  </MutationForm>
                </article>
              </div>
            ) : (
              <div className="zalo-request-resolved">
                <strong>{request.status === "APPROVED" ? "Đã duyệt" : "Đã từ chối"}</strong>
                {request.resolvedAt && <span>{formatDate(request.resolvedAt)}</span>}
                {request.rejectionReason && <p>{request.rejectionReason}</p>}
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
