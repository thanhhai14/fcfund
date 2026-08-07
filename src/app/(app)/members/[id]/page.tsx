import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  chargeTypes,
  fundTransactions,
  memberChargeAssignments,
  memberCharges,
  members,
  users,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Chatter } from "@/components/chatter";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import {
  createAssignmentAction,
  createMemberAccountAction,
  linkUserToMemberAction,
  resetPasswordAction,
  unlinkUserFromMemberAction,
  updateMemberAccountAction,
  updateMemberAction,
} from "../../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatMoney, initials, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requireUser();
  if (!(await can(PERMISSIONS.MEMBERS_VIEW))) redirect("/dashboard");
  const { id } = await params;
  const [member] = await db.select().from(members)
    .where(and(eq(members.id, id), eq(members.clubId, currentUser.clubId))).limit(1);
  if (!member) notFound();

  const [account] = await db.select().from(users).where(eq(users.memberId, id)).limit(1);
  const assignments = await db
    .select({
      id: memberChargeAssignments.id,
      name: chargeTypes.name,
      customAmount: memberChargeAssignments.customAmount,
      defaultAmount: chargeTypes.defaultAmount,
      validFrom: memberChargeAssignments.validFrom,
      validUntil: memberChargeAssignments.validUntil,
      active: memberChargeAssignments.isActive,
    })
    .from(memberChargeAssignments)
    .innerJoin(chargeTypes, eq(memberChargeAssignments.chargeTypeId, chargeTypes.id))
    .where(eq(memberChargeAssignments.memberId, id));
  const availableTypes = await db.select().from(chargeTypes)
    .where(and(eq(chargeTypes.clubId, currentUser.clubId), eq(chargeTypes.isActive, true)));
  const charges = await db
    .select({
      id: memberCharges.id, date: memberCharges.chargeDate, amount: memberCharges.totalAmount,
      quantity: memberCharges.quantity, name: chargeTypes.name, note: memberCharges.note,
    })
    .from(memberCharges)
    .innerJoin(chargeTypes, eq(memberCharges.chargeTypeId, chargeTypes.id))
    .where(and(eq(memberCharges.memberId, id), isNull(memberCharges.deletedAt)))
    .orderBy(desc(memberCharges.chargeDate));
  const payments = await db.select().from(fundTransactions)
    .where(and(eq(fundTransactions.memberId, id), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt)))
    .orderBy(desc(fundTransactions.transactionDate));
  const totalCharged = charges.reduce((sum, row) => sum + row.amount, 0);
  const totalPaid = payments.reduce((sum, row) => sum + row.amount, 0);
  const balance = totalPaid - totalCharged;
  const canManage = await can(PERMISSIONS.MEMBERS_MANAGE);
  const canManageUsers = await can(PERMISSIONS.USERS_MANAGE);
  const canManageCharges = await can(PERMISSIONS.CHARGES_MANAGE);
  const unlinkedAccounts = canManageUsers && !account ? await db.select({
    id: users.id,
    displayName: users.displayName,
    phone: users.phoneNormalized,
    role: users.role,
  }).from(users).where(and(eq(users.clubId, currentUser.clubId), isNull(users.memberId))).orderBy(users.displayName) : [];
  const hasTemporaryPhone = /^0{7,}/.test(member.phone);
  const ledger = [
    ...charges.map((row) => ({ id: `c-${row.id}`, date: row.date, label: row.name, amount: -row.amount, note: row.note })),
    ...payments.map((row) => ({ id: `p-${row.id}`, date: row.transactionDate, label: "Đã nộp tiền", amount: row.amount, note: row.note })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHeader
        eyebrow={`Thành viên · ${member.code}`}
        title={member.fullName}
        description={`${member.phone} · ${member.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}`}
        action={<Link href="/members" className="button secondary">← Danh sách</Link>}
      />
      <section className="profile-hero">
        <span className="member-avatar large">{initials(member.fullName)}</span>
        <div><small>Số dư thành viên</small><strong className={balance < 0 ? "money-out" : "money-in"}>{balance < 0 ? "-" : "+"}{formatMoney(Math.abs(balance))}</strong><p>{balance < 0 ? `Còn nợ ${formatMoney(-balance)}` : balance > 0 ? `Đóng dư ${formatMoney(balance)}` : "Đã thanh toán đủ"}</p></div>
        <div className="profile-totals"><span><small>Phải đóng</small><b>{formatMoney(totalCharged)}</b></span><span><small>Đã nộp</small><b>{formatMoney(totalPaid)}</b></span></div>
      </section>

      <section className="detail-columns">
        <div className="stack">
          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Cấu hình</span><h2>Khoản thu đang áp dụng</h2></div>
              {canManageCharges && <Disclosure label="+ Gán khoản thu" className="inline-disclosure">
                <MutationForm action={createAssignmentAction} className="form-stack">
                  <input type="hidden" name="memberId" value={member.id} />
                  <label>Loại thu<select name="chargeTypeId">{availableTypes.map((type) => <option value={type.id} key={type.id}>{type.name} · {formatMoney(type.defaultAmount)}</option>)}</select></label>
                  <label>Đơn giá riêng<input name="customAmount" type="number" min="0" placeholder="Để trống dùng giá mặc định" /></label>
                  <div className="form-row"><label>Từ ngày<input name="validFrom" type="date" defaultValue={todayInTimezone()} required /></label><label>Đến ngày<input name="validUntil" type="date" /></label></div>
                  <label className="check-field"><input type="checkbox" name="chargeCurrentMonth" /> Thu luôn tháng hiện tại</label>
                  <label>Ghi chú<textarea name="note" rows={2} /></label>
                  <SubmitButton>Lưu áp dụng</SubmitButton>
                </MutationForm>
              </Disclosure>}
            </div>
            <div className="assignment-list">
              {assignments.map((item) => <div key={item.id}><span><strong>{item.name}</strong><small>{formatDate(item.validFrom)} → {item.validUntil ? formatDate(item.validUntil) : "Vĩnh viễn"}</small></span><b>{formatMoney(item.customAmount ?? item.defaultAmount)}</b></div>)}
              {!assignments.length && <p className="muted">Chưa gán khoản thu nào.</p>}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Sổ số dư</span><h2>Lịch sử phát sinh</h2></div></div>
            <div className="ledger">
              {ledger.map((item) => <div key={item.id}><span><strong>{item.label}</strong><small>{formatDate(item.date)}{item.note ? ` · ${item.note}` : ""}</small></span><b className={item.amount >= 0 ? "money-in" : "money-out"}>{item.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(item.amount))}</b></div>)}
              {!ledger.length && <p className="muted">Chưa có phát sinh.</p>}
            </div>
          </article>
        </div>

        <div className="stack">
          {canManage && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Hồ sơ</span><h2>Thông tin thành viên</h2></div></div>
            <MutationForm action={updateMemberAction} className="form-stack">
              <input type="hidden" name="id" value={member.id} />
              <label>Họ và tên<input name="fullName" defaultValue={member.fullName} required /></label>
              <label>Số điện thoại<input name="phone" defaultValue={member.phone} required /></label>
              <label>Trạng thái<select name="status" defaultValue={member.status}><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option></select></label>
              <label>Ghi chú<textarea name="note" rows={2} defaultValue={member.note ?? ""} /></label>
              <SubmitButton>Lưu hồ sơ</SubmitButton>
            </MutationForm>
          </article>}
          {canManageUsers && <article className="panel member-account-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Đăng nhập</span><h2>Tài khoản thành viên</h2></div>
              <span className={`account-state ${account?.isActive ? "active" : "inactive"}`}>{account ? account.isActive ? "Đang mở" : "Đã khóa" : "Chưa kích hoạt"}</span>
            </div>

            {!account ? <>
              <p className="panel-note">Tạo tài khoản mới hoặc gắn một tài khoản độc lập đã có. Thông tin đăng nhập và hồ sơ thành viên được quản lý riêng.</p>
              {hasTemporaryPhone && <p className="account-warning">Hồ sơ đang dùng số điện thoại tạm. Hãy nhập số điện thoại thực tế trước khi tạo tài khoản.</p>}
              <MutationForm action={createMemberAccountAction} className="form-stack">
                <input type="hidden" name="memberId" value={member.id} />
                <label>Tên hiển thị<input name="displayName" defaultValue={member.fullName} required /></label>
                <label>Số điện thoại đăng nhập<input name="phone" inputMode="numeric" pattern="[0-9]*" defaultValue={member.phone} required /></label>
                <label>Vai trò<select name="role" defaultValue="MEMBER"><option value="MEMBER">Thành viên</option><option value="TREASURER">Thủ quỹ</option></select></label>
                <SubmitButton>Tạo tài khoản đăng nhập</SubmitButton>
              </MutationForm>
              {!!unlinkedAccounts.length && <div className="account-link-box member-link-existing">
                <MutationForm action={linkUserToMemberAction} className="form-stack compact">
                  <input type="hidden" name="memberId" value={member.id} />
                  <label>Hoặc gắn tài khoản có sẵn<select name="userId" required><option value="">Chọn tài khoản</option>{unlinkedAccounts.map((item) => <option value={item.id} key={item.id}>{item.displayName} · {item.phone} · {ROLE_LABELS[item.role]}</option>)}</select></label>
                  <SubmitButton variant="secondary">Gắn tài khoản có sẵn</SubmitButton>
                </MutationForm>
              </div>}
            </> : <>
              <div className="account-login-meta">
                <span><small>Vai trò hiện tại</small><strong>{ROLE_LABELS[account.role]}</strong></span>
                <span><small>Đăng nhập gần nhất</small><strong>{account.lastLoginAt ? `${formatDate(account.lastLoginAt)} · ${account.lastLoginAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Chưa đăng nhập"}</strong></span>
              </div>
              {account.role === "ADMIN" ? <p className="account-warning">Tài khoản Admin được quản lý tại Cài đặt để tránh thay đổi nhầm vai trò quản trị.</p> : <MutationForm action={updateMemberAccountAction} className="form-stack">
                <input type="hidden" name="userId" value={account.id} />
                <label>Tên hiển thị<input name="displayName" defaultValue={account.displayName} required /></label>
                <label>Số điện thoại đăng nhập<input name="phone" inputMode="numeric" pattern="[0-9]*" defaultValue={account.phoneNormalized} required /></label>
                <label>Vai trò<select name="role" defaultValue={account.role}><option value="MEMBER">Thành viên</option><option value="TREASURER">Thủ quỹ</option></select></label>
                <label className="check-field account-active-field"><input name="isActive" type="checkbox" defaultChecked={account.isActive} /><span><strong>Cho phép đăng nhập</strong><small>Tắt tùy chọn này để khóa tài khoản nhưng vẫn giữ dữ liệu.</small></span></label>
                <SubmitButton>Lưu tài khoản</SubmitButton>
              </MutationForm>}
              <form action={resetPasswordAction} className="reset-row"><input type="hidden" name="userId" value={account.id} /><span>Mật khẩu mặc định: <b>Trailang123</b></span><button className="button danger small">Đặt lại mật khẩu</button></form>
              <div className="account-link-box"><MutationForm action={unlinkUserFromMemberAction} className="form-stack compact"><input type="hidden" name="userId" value={account.id} /><p>Tháo liên kết không xóa tài khoản hoặc dữ liệu thành viên.</p><SubmitButton variant="secondary">Tháo liên kết tài khoản</SubmitButton></MutationForm></div>
            </>}
          </article>}
          <article className="panel">
            <Chatter clubId={currentUser.clubId} entityType="member" entityId={member.id} path={`/members/${member.id}`} />
          </article>
        </div>
      </section>
    </>
  );
}
