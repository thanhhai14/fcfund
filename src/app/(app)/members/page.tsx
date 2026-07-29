import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { fundTransactions, memberCharges, members, users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import { createMemberAction } from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/constants";
import { formatMoney, initials, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Thành viên" };

export default async function MembersPage() {
  const currentUser = await requireUser();
  if (!(await can(PERMISSIONS.MEMBERS_VIEW))) redirect("/dashboard");
  const canManage = await can(PERMISSIONS.MEMBERS_MANAGE);

  const rows = await db
    .select({
      id: members.id,
      code: members.code,
      name: members.fullName,
      phone: members.phone,
      status: members.status,
      role: users.role,
      hasAccount: sql<boolean>`${users.id} IS NOT NULL`,
    })
    .from(members)
    .leftJoin(users, eq(members.id, users.memberId))
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
  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;

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
              <label className="check-field"><input name="createAccount" type="checkbox" defaultChecked /> Tạo tài khoản đăng nhập</label>
              <label className="full">Ghi chú<textarea name="note" rows={2} /></label>
              <div className="form-actions full"><SubmitButton>Tạo thành viên</SubmitButton></div>
            </MutationForm>
          </Disclosure>
        ) : undefined}
      />

      <div className="summary-line">
        <span><strong>{rows.length}</strong> hồ sơ</span>
        <span><strong>{rows.filter((row) => row.hasAccount).length}</strong> tài khoản</span>
        <span><strong>{rows.filter((row) => (paymentMap.get(row.id) ?? 0) - (chargeMap.get(row.id) ?? 0) < 0).length}</strong> còn nợ</span>
      </div>

      <section className="member-grid">
        {rows.map((member) => {
          const balance = (paymentMap.get(member.id) ?? 0) - (chargeMap.get(member.id) ?? 0);
          return (
            <Link href={`/members/${member.id}`} className={`member-card ${member.status === "INACTIVE" ? "inactive" : ""}`} key={member.id}>
              <div className="member-card-top">
                <span className="member-avatar">{initials(member.name)}</span>
                <div><h2>{member.name}</h2><p>{member.code} · {member.phone}</p></div>
                <span className={`status-dot ${member.status.toLowerCase()}`} />
              </div>
              <div className="member-card-meta">
                <div><small>Tài khoản</small><strong>{member.hasAccount ? ROLE_LABELS[member.role!] : "Chưa tạo"}</strong></div>
                <div className="align-right"><small>{balance < 0 ? "Còn nợ" : "Số dư"}</small><strong className={balance < 0 ? "money-out" : "money-in"}>{formatMoney(Math.abs(balance))}</strong></div>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}
