import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { avatars, fundTransactions, memberCharges, members, users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { createMemberAction } from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/constants";
import { todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { MembersCollection } from "@/components/members-collection";
import { getMatchFormStats } from "@/lib/match-form-stats";

export const metadata = { title: "Thành viên" };

export default async function MembersPage() {
  const currentUser = await requireUser();
  if (!(await can(PERMISSIONS.MEMBERS_VIEW))) redirect("/dashboard");
  const [canManage, canViewForm] = await Promise.all([
    can(PERMISSIONS.MEMBERS_MANAGE),
    can(PERMISSIONS.MATCH_FORM_REPORT_VIEW),
  ]);

  const rows = await db
    .select({
      id: members.id,
      code: members.code,
      name: members.fullName,
      phone: members.phone,
      status: members.status,
      role: users.role,
      hasAccount: sql<boolean>`${users.id} IS NOT NULL`,
      avatarUpdatedAt: avatars.updatedAt,
    })
    .from(members)
    .leftJoin(users, eq(members.id, users.memberId))
    .leftJoin(avatars, eq(members.id, avatars.memberId))
    .where(eq(members.clubId, currentUser.clubId))
    .orderBy(members.status, members.fullName);

  const charges = await db
    .select({
      memberId: memberCharges.memberId,
      amount: sql<string>`COALESCE(SUM(${memberCharges.totalAmount}), 0)`,
    })
    .from(memberCharges)
    .where(and(eq(memberCharges.clubId, currentUser.clubId), isNull(memberCharges.deletedAt)))
    .groupBy(memberCharges.memberId);
  const payments = await db
    .select({
      memberId: fundTransactions.memberId,
      amount: sql<string>`COALESCE(SUM(${fundTransactions.amount}), 0)`,
    })
    .from(fundTransactions)
    .where(and(
      eq(fundTransactions.clubId, currentUser.clubId),
      eq(fundTransactions.kind, "MEMBER_PAYMENT"),
      isNull(fundTransactions.deletedAt),
    ))
    .groupBy(fundTransactions.memberId);
  const chargeMap = new Map(charges.map((row) => [row.memberId, Number(row.amount)]));
  const paymentMap = new Map(payments.map((row) => [row.memberId, Number(row.amount)]));
  const formStats = canViewForm
    ? await getMatchFormStats({
      clubId: currentUser.clubId,
      playedOn: "9999-12-31",
      memberIds: rows.map((row) => row.id),
      lookbackMatches: 10,
    })
    : new Map();
  const activeRows = rows.filter((row) => row.status === "ACTIVE");
  const activeCount = activeRows.length;

  return (
    <>
      <PageHeader
        eyebrow="Đội hình"
        title="Thành viên"
        description={`${activeCount} thành viên đang hoạt động`}
        action={canManage ? (
          <Disclosure label={<><Icon name="plus" /> Thêm thành viên</>} className="action-disclosure">
            <MutationForm action={createMemberAction} className="form-grid">
              <label>Mã thành viên<input name="code" placeholder="VD: TV025" /></label>
              <label>Họ và tên<input name="fullName" required placeholder="Nguyễn Văn A" /></label>
              <label>Số điện thoại<input name="phone" inputMode="numeric" pattern="[0-9]*" required placeholder="0901234567" /></label>
              <label>Ngày tham gia<input name="joinedOn" type="date" defaultValue={todayInTimezone()} /></label>
              <label>Vai trò tài khoản<select name="role"><option value="MEMBER">Thành viên</option><option value="TREASURER">Thủ quỹ</option></select></label>
              <label className="check-field"><input name="createAccount" type="checkbox" /> Tạo và liên kết tài khoản đăng nhập</label>
              <label className="full">Ghi chú<textarea name="note" rows={2} /></label>
              <div className="form-actions full"><SubmitButton>Tạo thành viên</SubmitButton></div>
            </MutationForm>
          </Disclosure>
        ) : undefined}
      />

      <div className="summary-line">
        <span><strong>{activeCount}</strong> đang hoạt động</span>
        <span><strong>{activeRows.filter((row) => row.hasAccount).length}</strong> tài khoản</span>
        <span><strong>{activeRows.filter((row) => (paymentMap.get(row.id) ?? 0) - (chargeMap.get(row.id) ?? 0) < 0).length}</strong> còn nợ</span>
      </div>

      <MembersCollection showForm={canViewForm} rows={rows.map((member) => ({
        id: member.id,
        code: member.code,
        name: member.name,
        phone: member.phone,
        status: member.status,
        hasAccount: member.hasAccount,
        accountLabel: member.hasAccount ? ROLE_LABELS[member.role!] : "Chưa tạo",
        balance: (paymentMap.get(member.id) ?? 0) - (chargeMap.get(member.id) ?? 0),
        formScore: formStats.get(member.id)?.formScore ?? 5000,
        avatarVersion: member.avatarUpdatedAt?.getTime() ?? null,
      }))} />
    </>
  );
}
