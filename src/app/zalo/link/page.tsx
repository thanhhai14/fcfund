import type { Metadata } from "next";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { authIdentities, members, users } from "@/db/schema";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { getCurrentUser } from "@/lib/auth";
import { maskPhone, readZaloLinkContext } from "@/lib/zalo-linking";
import { confirmZaloCandidateAction, sendZaloForAdminReviewAction } from "./actions";

export const metadata: Metadata = { title: "Liên kết Zalo" };

export default async function ZaloLinkPage() {
  const currentUser = await getCurrentUser();
  if (currentUser) redirect("/dashboard");

  const context = await readZaloLinkContext();
  if (!context) redirect("/login");

  const [candidate] = await db
    .select({
      userId: users.id,
      memberName: members.fullName,
      memberCode: members.code,
      phone: users.phoneNormalized,
    })
    .from(users)
    .innerJoin(members, eq(users.memberId, members.id))
    .leftJoin(authIdentities, and(
      eq(authIdentities.userId, users.id),
      eq(authIdentities.provider, "ZALO"),
    ))
    .where(and(
      eq(users.id, context.candidateUserId),
      eq(users.clubId, context.clubId),
      eq(users.isActive, true),
      eq(members.status, "ACTIVE"),
      isNull(authIdentities.id),
    ))
    .limit(1);

  return (
    <main className="center-page zalo-auth-page">
      <section className="panel zalo-link-card">
        <span className="eyebrow">Đăng nhập bằng Zalo</span>
        <h1>Xác nhận thành viên</h1>
        <p className="panel-note">
          FCFUND tìm thấy một thành viên có tên gần khớp với tài khoản Zalo <strong>{context.displayName}</strong>.
        </p>

        {candidate ? (
          <>
            <div className="zalo-candidate-card">
              <strong>{candidate.memberName}</strong>
              <span>Mã thành viên: {candidate.memberCode}</span>
              <span>SĐT đăng nhập: {maskPhone(candidate.phone)}</span>
            </div>

            <p><strong>Đây có phải là bạn không?</strong></p>

            <MutationForm action={confirmZaloCandidateAction} className="form-stack">
              <label>
                Mật khẩu FCFUND
                <input name="password" type="password" autoComplete="current-password" required minLength={6} />
              </label>
              <SubmitButton pendingLabel="Đang xác minh…">Đúng, đây là tôi</SubmitButton>
            </MutationForm>

            <MutationForm action={sendZaloForAdminReviewAction} className="form-stack zalo-review-form">
              <SubmitButton variant="secondary" pendingLabel="Đang gửi yêu cầu…">
                Không phải tôi · Gửi Chủ Tịch Fifa duyệt
              </SubmitButton>
            </MutationForm>
          </>
        ) : (
          <>
            <p className="form-message error">
              Candidate này không còn khả dụng hoặc đã được liên kết Zalo ở nơi khác.
            </p>
            <MutationForm action={sendZaloForAdminReviewAction} className="form-stack">
              <SubmitButton pendingLabel="Đang gửi yêu cầu…">Gửi Chủ Tịch Fifa duyệt</SubmitButton>
            </MutationForm>
          </>
        )}
      </section>
    </main>
  );
}
