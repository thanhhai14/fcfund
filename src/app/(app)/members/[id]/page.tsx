import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  chargeTypes,
  avatars,
  fundTransactions,
  memberChargeAssignments,
  memberCharges,
  memberProfiles,
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
  updateAssignmentAction,
  updateMemberAccountAction,
  updateMemberAction,
  updateMemberProfileAction,
} from "../../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { MemberAvatar } from "@/components/member-identity";
import { getMatchFormStats, getMemberCareerStats } from "@/lib/match-form-stats";
import { preferredFootLabel } from "@/lib/member-profile";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await requireUser();
  const { id } = await params;
  const isOwnProfile = currentUser.memberId === id;
  const canViewMembers = await can(PERMISSIONS.MEMBERS_VIEW);
  if (!isOwnProfile && !canViewMembers) redirect("/dashboard");
  const [member] = await db.select().from(members)
    .where(and(eq(members.id, id), eq(members.clubId, currentUser.clubId))).limit(1);
  if (!member) notFound();

  const [canManage, canManageUsers, canManageCharges, canAudit, canViewOtherBalances, canViewAllCharges, canViewOwnCharges, canViewAllPayments, canViewOwnPayments, canViewMatchForm] = await Promise.all([
    can(PERMISSIONS.MEMBERS_MANAGE), can(PERMISSIONS.USERS_MANAGE), can(PERMISSIONS.CHARGES_MANAGE), can(PERMISSIONS.AUDIT_VIEW),
    can(PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW), can(PERMISSIONS.CHARGES_VIEW_ALL), can(PERMISSIONS.CHARGES_VIEW_OWN),
    can(PERMISSIONS.PAYMENTS_VIEW_ALL), can(PERMISSIONS.PAYMENTS_VIEW_OWN), can(PERMISSIONS.MATCH_FORM_REPORT_VIEW),
  ]);
  const mayViewCharges = canViewAllCharges || (isOwnProfile && canViewOwnCharges);
  const mayViewPayments = canViewAllPayments || (isOwnProfile && canViewOwnPayments);
  const mayViewBalance = canViewOtherBalances || (isOwnProfile && mayViewCharges && mayViewPayments);
  const mayViewPhone = canManage || isOwnProfile;
  const [account] = canManageUsers ? await db.select().from(users).where(eq(users.memberId, id)).limit(1) : [];
  const [[profile], [avatar]] = await Promise.all([
    db.select().from(memberProfiles).where(eq(memberProfiles.memberId, id)).limit(1),
    db.select().from(avatars).where(eq(avatars.memberId, id)).limit(1),
  ]);
  const assignments = mayViewCharges ? await db
    .select({
      id: memberChargeAssignments.id,
      name: chargeTypes.name,
      customAmount: memberChargeAssignments.customAmount,
      defaultAmount: chargeTypes.defaultAmount,
      validFrom: memberChargeAssignments.validFrom,
      validUntil: memberChargeAssignments.validUntil,
      active: memberChargeAssignments.isActive,
      note: memberChargeAssignments.note,
    })
    .from(memberChargeAssignments)
    .innerJoin(chargeTypes, eq(memberChargeAssignments.chargeTypeId, chargeTypes.id))
    .where(eq(memberChargeAssignments.memberId, id)) : [];
  const availableTypes = canManageCharges ? await db.select().from(chargeTypes)
    .where(and(eq(chargeTypes.clubId, currentUser.clubId), eq(chargeTypes.isActive, true))) : [];
  const charges = (mayViewCharges || mayViewBalance) ? await db
    .select({
      id: memberCharges.id, date: memberCharges.chargeDate, amount: memberCharges.totalAmount,
      quantity: memberCharges.quantity, name: chargeTypes.name, note: memberCharges.note,
      iconName: chargeTypes.iconName, color: chargeTypes.color,
    })
    .from(memberCharges)
    .innerJoin(chargeTypes, eq(memberCharges.chargeTypeId, chargeTypes.id))
    .where(and(eq(memberCharges.memberId, id), isNull(memberCharges.deletedAt)))
    .orderBy(desc(memberCharges.chargeDate)) : [];
  const payments = (mayViewPayments || mayViewBalance) ? await db.select().from(fundTransactions)
    .where(and(eq(fundTransactions.memberId, id), eq(fundTransactions.kind, "MEMBER_PAYMENT"), isNull(fundTransactions.deletedAt)))
    .orderBy(desc(fundTransactions.transactionDate)) : [];
  const totalCharged = charges.reduce((sum, row) => sum + row.amount, 0);
  const totalPaid = payments.reduce((sum, row) => sum + row.amount, 0);
  const balance = totalPaid - totalCharged;
  const canEditProfile = canManage || (currentUser.memberId === id && await can(PERMISSIONS.MEMBER_PROFILE_EDIT_OWN));
  const unlinkedAccounts = canManageUsers && !account ? await db.select({
    id: users.id,
    displayName: users.displayName,
    phone: users.phoneNormalized,
    role: users.role,
  }).from(users).where(and(eq(users.clubId, currentUser.clubId), isNull(users.memberId))).orderBy(users.displayName) : [];
  const hasTemporaryPhone = /^0{7,}/.test(member.phone);
  const [careerStats, currentFormStats] = canViewMatchForm ? await Promise.all([
    getMemberCareerStats({ clubId: currentUser.clubId, memberId: id }),
    getMatchFormStats({ clubId: currentUser.clubId, playedOn: "9999-12-31", memberIds: [id], lookbackMatches: 10 }),
  ]) : [null, null];
  const currentForm = currentFormStats?.get(id);
  const ledger = [
    ...(mayViewCharges ? charges.map((row) => ({ id: `c-${row.id}`, date: row.date, label: row.name, amount: -row.amount, note: row.note, iconName: row.iconName, color: row.color })) : []),
    ...(mayViewPayments ? payments.map((row) => ({ id: `p-${row.id}`, date: row.transactionDate, label: "Đã nộp tiền", amount: row.amount, note: row.note, iconName: "money-bill-transfer", color: "#287a55" })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHeader
        eyebrow="Thành viên"
        title="Hồ sơ cầu thủ"
        description="Thông tin cá nhân và hoạt động quỹ của thành viên"
        action={<Link href={canViewMembers ? "/members" : "/dashboard"} className="button secondary">{canViewMembers ? "← Danh sách" : "← Tổng quan"}</Link>}
      />
      <section className="member-profile-passport">
        <div className="member-profile-portrait" data-watermark={profile?.shirtNumber !== null && profile?.shirtNumber !== undefined ? String(profile.shirtNumber) : member.code}>
          <div className="member-profile-avatar-frame">
            <MemberAvatar memberId={member.id} name={member.fullName} avatarVersion={avatar?.updatedAt} className="profile-avatar" />
            {profile?.shirtNumber !== null && profile?.shirtNumber !== undefined && <span className="member-profile-shirt-number">#{profile.shirtNumber}</span>}
          </div>
        </div>

        <article className="member-cv-panel">
          <div className="member-profile-heading">
            <div>
              <span className="eyebrow">Cầu thủ</span>
              <h2>{member.fullName}</h2>
              <div className="member-profile-subline">
                <span>{profile?.nickname ? `Biệt danh: ${profile.nickname}` : "Chưa cập nhật biệt danh"}</span>
                {mayViewPhone && <span className="member-profile-phone">{member.phone}</span>}
              </div>
            </div>
            {canEditProfile && <Disclosure label={<><Icon name="edit" /> Chỉnh sửa CV</>} className="member-cv-disclosure"><MutationForm action={updateMemberProfileAction} className="form-stack member-profile-form"><input type="hidden" name="memberId" value={member.id} /><label>Avatar<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" /></label>{avatar && <label className="check-field"><input name="removeAvatar" type="checkbox" /> Xóa avatar hiện tại</label>}<label>Biệt danh<input name="nickname" defaultValue={profile?.nickname ?? ""} /></label><div className="form-row"><label>Vị trí sở trường<input name="preferredPosition" defaultValue={profile?.preferredPosition ?? ""} placeholder="Tiền đạo, hậu vệ..." /></label><label>Chân thuận<select name="preferredFoot" defaultValue={profile?.preferredFoot ?? ""}><option value="">Chưa chọn</option><option value="RIGHT">Chân phải</option><option value="LEFT">Chân trái</option><option value="BOTH">Hai chân</option></select></label></div><label>Số áo<input name="shirtNumber" type="number" min="0" max="99" defaultValue={profile?.shirtNumber ?? ""} /></label><label>Giới thiệu<textarea name="bio" rows={4} maxLength={2000} defaultValue={profile?.bio ?? ""} placeholder="Phong cách thi đấu, sở trường, lời giới thiệu..." /></label><SubmitButton>Lưu CV và avatar</SubmitButton></MutationForm></Disclosure>}
          </div>

          <div className="member-profile-bio">
            <span className="eyebrow">Giới thiệu bản thân</span>
            <p>{profile?.bio || "Thành viên chưa cập nhật giới thiệu."}</p>
          </div>

          <div className="member-profile-meta">
            <span><small>Vị trí sở trường</small><strong>{profile?.preferredPosition || "Chưa cập nhật"}</strong></span>
            <span><small>Chân thuận</small><strong className="preferred-foot-value">{profile?.preferredFoot && <Icon name="shoe-prints" />}{preferredFootLabel(profile?.preferredFoot)}</strong></span>
            <span><small>Số áo</small><strong className="accent">{profile?.shirtNumber !== null && profile?.shirtNumber !== undefined ? `#${profile.shirtNumber}` : "Chưa cập nhật"}</strong></span>
            <span><small>Trạng thái</small><strong>{member.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</strong></span>
          </div>
        </article>

        {careerStats && <div className="member-match-stats" aria-label="Thống kê kết quả thi đấu">
          <span><i><Icon name="futbol" /></i><span><small>Trận có kết quả</small><strong>{careerStats.matchCount}</strong></span></span>
          <span><i><Icon name="trophy" /></i><span><small>Thắng</small><strong>{careerStats.winCount}</strong></span></span>
          <span><i><Icon name="flag" /></i><span><small>Thua</small><strong>{careerStats.lossCount}</strong></span></span>
          <span><i><Icon name="chart" /></i><span><small>Tỷ lệ thắng</small><strong>{careerStats.winRate === null ? "—" : `${careerStats.winRate.toLocaleString("vi-VN")} %`}</strong></span></span>
          <span><i><Icon name="bolt" /></i><span><small>Điểm phong độ</small><strong>{currentForm ? Math.round(currentForm.formScore / 100) : 50}</strong></span></span>
        </div>}
      </section>

      <section className="detail-columns">
        <div className="stack">
          {mayViewBalance && <article className="panel member-finance-summary">
            <div className="panel-heading"><div><span className="eyebrow">Công nợ</span><h2>Tình trạng số dư</h2></div></div>
            <div className="member-finance-grid"><span><small>Số dư thành viên</small><strong className={balance < 0 ? "money-out" : "money-in"}>{balance < 0 ? "-" : balance > 0 ? "+" : ""}{formatMoney(Math.abs(balance))}</strong><em>{balance < 0 ? `Còn nợ ${formatMoney(-balance)}` : balance > 0 ? `Đóng dư ${formatMoney(balance)}` : "Đã thanh toán đủ"}</em></span><span><small>Phải đóng</small><strong>{formatMoney(totalCharged)}</strong></span><span><small>Đã nộp</small><strong>{formatMoney(totalPaid)}</strong></span></div>
          </article>}

          {mayViewCharges && <article className="panel">
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
              {assignments.map((item) => <div className={!item.active ? "inactive" : undefined} key={item.id}><span><strong>{item.name}</strong><small>{formatDate(item.validFrom)} → {item.validUntil ? formatDate(item.validUntil) : "Vĩnh viễn"} · {item.active ? "Đang áp dụng" : "Đã dừng"}</small></span><b>{formatMoney(item.customAmount ?? item.defaultAmount)}</b>{canManageCharges && <Disclosure label={<Icon name="edit" />} className="assignment-edit-disclosure type-edit-disclosure"><MutationForm action={updateAssignmentAction} className="form-stack"><input type="hidden" name="id" value={item.id} /><label>Đơn giá riêng<input name="customAmount" type="number" min="0" defaultValue={item.customAmount ?? ""} placeholder={`Mặc định ${formatMoney(item.defaultAmount)}`} /></label><div className="form-row"><label>Từ ngày<input name="validFrom" type="date" defaultValue={item.validFrom} required /></label><label>Đến ngày<input name="validUntil" type="date" defaultValue={item.validUntil ?? ""} /></label></div><label className="check-field"><input name="isActive" type="checkbox" defaultChecked={item.active} /> Đang áp dụng</label><label>Ghi chú<textarea name="note" rows={2} defaultValue={item.note ?? ""} /></label><p className="panel-note">Thay đổi chỉ áp dụng cho phát sinh tương lai, không sửa các khoản đã tạo.</p><SubmitButton>Lưu cấu hình</SubmitButton></MutationForm></Disclosure>}</div>)}
              {!assignments.length && <p className="muted">Chưa gán khoản thu nào.</p>}
            </div>
          </article>}

          {(mayViewCharges || mayViewPayments) && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Công nợ cá nhân</span><h2>Lịch sử số dư</h2></div></div>
            <div className="ledger">
              {ledger.map((item) => <div key={item.id}><span className="ledger-icon" style={{ color: item.color ?? undefined }}><Icon name={item.iconName} /></span><span><strong>{item.label}</strong><small>{formatDate(item.date)}{item.note ? ` · ${item.note}` : ""}</small></span><b className={item.amount >= 0 ? "money-in" : "money-out"}>{item.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(item.amount))}</b></div>)}
              {!ledger.length && <p className="muted">Chưa có phát sinh.</p>}
            </div>
          </article>}
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
                <label>Vai trò<select name="role" defaultValue="MEMBER"><option value="MEMBER">Thành viên</option><option value="ORGANIZER">Người tổ chức</option><option value="TREASURER">Thủ quỹ</option></select></label>
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
                <span><small>Đăng nhập gần nhất</small><strong>{account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Chưa đăng nhập"}</strong></span>
              </div>
              {account.role === "ADMIN" ? <p className="account-warning">Tài khoản Admin được quản lý tại Cài đặt để tránh thay đổi nhầm vai trò quản trị.</p> : <MutationForm action={updateMemberAccountAction} className="form-stack">
                <input type="hidden" name="userId" value={account.id} />
                <label>Tên hiển thị<input name="displayName" defaultValue={account.displayName} required /></label>
                <label>Số điện thoại đăng nhập<input name="phone" inputMode="numeric" pattern="[0-9]*" defaultValue={account.phoneNormalized} required /></label>
                <label>Vai trò<select name="role" defaultValue={account.role}><option value="MEMBER">Thành viên</option><option value="ORGANIZER">Người tổ chức</option><option value="TREASURER">Thủ quỹ</option></select></label>
                <label className="check-field account-active-field"><input name="isActive" type="checkbox" defaultChecked={account.isActive} /><span><strong>Cho phép đăng nhập</strong><small>Tắt tùy chọn này để khóa tài khoản nhưng vẫn giữ dữ liệu.</small></span></label>
                <SubmitButton>Lưu tài khoản</SubmitButton>
              </MutationForm>}
              <form action={resetPasswordAction} className="reset-row"><input type="hidden" name="userId" value={account.id} /><span>Mật khẩu mặc định: <b>Trailang123</b></span><button className="button danger small">Đặt lại mật khẩu</button></form>
              <div className="account-link-box"><MutationForm action={unlinkUserFromMemberAction} className="form-stack compact"><input type="hidden" name="userId" value={account.id} /><p>Tháo liên kết không xóa tài khoản hoặc dữ liệu thành viên.</p><SubmitButton variant="secondary">Tháo liên kết tài khoản</SubmitButton></MutationForm></div>
            </>}
          </article>}
          {canAudit && <article className="panel">
            <Chatter clubId={currentUser.clubId} entityType="member" entityId={member.id} path={`/members/${member.id}`} />
          </article>}
        </div>
      </section>
    </>
  );
}
