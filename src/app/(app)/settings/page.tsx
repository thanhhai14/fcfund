/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  avatars,
  chargeTypes,
  clubs,
  fundCategories,
  members,
  rolePermissions,
  userPermissionOverrides,
  users,
  zaloLinkRequests,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, PendingButton, SubmitButton } from "@/components/mutation-form";
import { ChargeTypeFields } from "@/components/charge-type-fields";
import {
  changeOwnPasswordAction,
  createChargeTypeAction,
  createFundCategoryAction,
  createUserAccountAction,
  linkUserToMemberAction,
  resetPasswordAction,
  saveUserPoliciesAction,
  unlinkUserFromMemberAction,
  updateClubAction,
  updateChargeTypeAction,
  updateUserAccountAction,
  updateOwnAvatarAction,
} from "../mutations";
import { can } from "@/lib/permissions";
import {
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  ROLE_LABELS,
} from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { MemberAvatar, MemberIdentity } from "@/components/member-identity";
import { SearchableMemberSelect } from "@/components/searchable-member-select";
import { PushNotificationSettings } from "@/components/push-notification-settings";
import { PushDeviceManager } from "@/components/push-device-manager";
import { DebtReminderTest } from "@/components/debt-reminder-test";
import { getVietQrBanks } from "@/lib/vietqr";
import type { ReactNode } from "react";

export const metadata = { title: "Cài đặt" };

function SettingsGroup({
  title,
  description,
  icon,
  children,
  open = false,
}: {
  title: string;
  description: string;
  icon: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="settings-group" open={open}>
      <summary className="settings-group-summary">
        <span className="settings-group-icon"><Icon name={icon} /></span>
        <span className="settings-group-copy"><strong>{title}</strong><small>{description}</small></span>
        <span className="settings-group-chevron" aria-hidden="true" />
      </summary>
      <div className="settings-group-content">{children}</div>
    </details>
  );
}

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const manageSettings = await can(PERMISSIONS.SETTINGS_MANAGE);
  const manageUsers = await can(PERMISSIONS.USERS_MANAGE);
  const pendingZaloRequests = currentUser.role === "ADMIN" ? await db.select({ id: zaloLinkRequests.id })
    .from(zaloLinkRequests)
    .where(and(eq(zaloLinkRequests.clubId, currentUser.clubId), eq(zaloLinkRequests.status, "PENDING"))) : [];
  const [club] = await db.select().from(clubs).where(eq(clubs.id, currentUser.clubId)).limit(1);
  const bankOptions = manageSettings
    ? await getVietQrBanks().catch((error) => {
        console.error("[settings] VietQR bank list failed", error instanceof Error ? error.message : "Unknown error");
        return [];
      })
    : [];
  const types = manageSettings ? await db.select().from(chargeTypes)
    .where(eq(chargeTypes.clubId, currentUser.clubId)).orderBy(chargeTypes.name) : [];
  const categories = manageSettings ? await db.select().from(fundCategories)
    .where(eq(fundCategories.clubId, currentUser.clubId)).orderBy(fundCategories.direction, fundCategories.name) : [];
  const accounts = manageUsers ? await db
    .select({
      id: users.id, displayName: users.displayName, phone: users.phoneNormalized, role: users.role, active: users.isActive,
      memberId: users.memberId,
      memberName: members.fullName,
      avatarUpdatedAt: avatars.updatedAt,
    })
    .from(users).leftJoin(members, eq(users.memberId, members.id))
    .leftJoin(avatars, or(eq(users.id, avatars.userId), eq(users.memberId, avatars.memberId)))
    .where(eq(users.clubId, currentUser.clubId)).orderBy(users.role, users.displayName) : [];
  const availableMembers = manageUsers ? await db.select({ id: members.id, name: members.fullName, code: members.code, avatarUpdatedAt: avatars.updatedAt })
    .from(members).leftJoin(users, eq(members.id, users.memberId)).leftJoin(avatars, eq(members.id, avatars.memberId))
    .where(and(eq(members.clubId, currentUser.clubId), isNull(users.id))).orderBy(members.fullName) : [];
  const overrides = manageUsers ? await db.select().from(userPermissionOverrides) : [];
  const rolePolicies = manageUsers ? await db.select().from(rolePermissions) : [];
  const overrideMap = new Map<string, Map<string, boolean>>();
  overrides.forEach((item) => {
    const map = overrideMap.get(item.userId) ?? new Map<string, boolean>();
    map.set(item.permissionKey, item.allowed);
    overrideMap.set(item.userId, map);
  });
  const rolePolicyMap = new Map(rolePolicies.map((item) => [`${item.role}|${item.permissionKey}`, item.allowed]));

  return (
    <>
      <PageHeader eyebrow="Hệ thống" title="Cài đặt" description="Đội bóng, loại thu, tài khoản và policy" />
      <section className="settings-layout settings-page-layout">
        {manageSettings && <SettingsGroup
          title="Đội bóng & quỹ"
          description="Nhận diện đội, các loại khoản thu và danh mục thu chi"
          icon="coins"
        >
        <div className="stack">
          {manageSettings && club && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Nhận diện</span><h2>Thông tin đội bóng</h2></div></div>
            <MutationForm action={updateClubAction} className="form-stack">
              <label>Tên đội bóng<input name="name" defaultValue={club.name} required /></label>
              <div className="form-row"><label>Logo đội<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label><label>Ảnh QR<input name="qr" type="file" accept="image/png,image/jpeg,image/webp" /></label></div>
              <div className="form-row">
                {bankOptions.length ? (
                  <label>Ngân hàng nhận tiền
                    <select name="bankCode" defaultValue={club.bankCode ?? ""}>
                      <option value="">Chưa cấu hình</option>
                      {club.bankCode && !bankOptions.some((bank) => bank.code === club.bankCode) && (
                        <option value={club.bankCode}>{club.bankName ?? club.bankCode} · cấu hình hiện tại</option>
                      )}
                      {bankOptions.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.shortName} · {bank.name}
                        </option>
                      ))}
                    </select>
                    {!club.bankCode && club.bankName && (
                      <small>Đang dùng cấu hình cũ: {club.bankName}. Hãy chọn lại ngân hàng để bật thanh toán trực tiếp.</small>
                    )}
                  </label>
                ) : (
                  <label>Ngân hàng nhận tiền
                    <input value={club.bankName ?? "Chưa cấu hình"} readOnly />
                    <small>Chưa tải được danh sách VietQR. Cấu hình ngân hàng hiện tại được giữ nguyên.</small>
                  </label>
                )}
                <label>Số tài khoản<input name="bankAccountNumber" defaultValue={club.bankAccountNumber ?? ""} /></label>
              </div>
              <label>Chủ tài khoản<input name="bankAccountHolder" defaultValue={club.bankAccountHolder ?? ""} /></label>
              <SubmitButton>Lưu thông tin đội</SubmitButton>
            </MutationForm>
            {(club.logoUrl || club.qrUrl) && <div className="asset-preview">{club.logoUrl && <div><small>Logo</small><img src={`/api/club-assets/logo?v=${club.updatedAt.getTime()}`} alt="Logo đội" /></div>}{club.qrUrl && <div><small>QR chuyển khoản</small><img src={`/api/club-assets/qr?v=${club.updatedAt.getTime()}`} alt="QR chuyển khoản" /></div>}</div>}
          </article>}

          {manageSettings && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Cấu hình</span><h2>Loại khoản thu</h2></div>
              <Disclosure label="+ Tạo loại thu" className="inline-disclosure type-create-disclosure">
                <MutationForm action={createChargeTypeAction} className="form-stack">
                  <label>Tên loại thu<input name="name" required /></label>
                  <ChargeTypeFields color="#ef7198" />
                  <SubmitButton>Tạo loại thu</SubmitButton>
                </MutationForm>
              </Disclosure>
            </div>
            <div className="settings-list">{types.map((type) => <div className={!type.isActive ? "inactive" : undefined} key={type.id}>
              <span className="stat-icon green" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span>
              <span><strong>{type.name}</strong><small>{type.calculation === "MONTHLY" ? "Tự sinh hằng tháng" : "Admin cập nhật số lần"} · {type.reportAsIcon ? "Báo cáo bằng icon" : "Báo cáo bằng tiền"}{type.isLossPenalty ? " · Phạt thua" : ""}{type.reportNextMonth ? " · Tổng kết tháng sau" : ""}</small></span>
              <b>{formatMoney(type.defaultAmount)}</b>
              <Disclosure label={<Icon name="edit" />} className="type-edit-disclosure">
                <MutationForm action={updateChargeTypeAction} className="form-stack">
                  <input type="hidden" name="id" value={type.id} />
                  <label>Tên loại thu<input name="name" defaultValue={type.name} required /></label>
                  <ChargeTypeFields
                    calculation={type.calculation}
                    amount={type.defaultAmount}
                    iconName={type.iconName}
                    color={type.color}
                    reportAsIcon={type.reportAsIcon}
                    isLossPenalty={type.isLossPenalty}
                    reportNextMonth={type.reportNextMonth}
                    includeStatus
                    isActive={type.isActive}
                  />
                  <SubmitButton>Lưu loại thu</SubmitButton>
                </MutationForm>
              </Disclosure>
            </div>)}</div>
          </article>}

          {manageSettings && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Sổ quỹ</span><h2>Danh mục thu & chi</h2></div>
              <Disclosure label="+ Thêm danh mục" className="inline-disclosure">
                <MutationForm action={createFundCategoryAction} className="form-stack">
                  <label>Tên danh mục<input name="name" required /></label>
                  <label>Hướng tiền<select name="direction"><option value="IN">Khoản thu</option><option value="OUT">Khoản chi</option></select></label>
                  <SubmitButton>Tạo danh mục</SubmitButton>
                </MutationForm>
              </Disclosure>
            </div>
            <div className="tag-list">{categories.map((category) => <span className={category.direction.toLowerCase()} key={category.id}>{category.direction === "IN" ? "Thu" : "Chi"} · {category.name}</span>)}</div>
          </article>}
        </div>
        </SettingsGroup>}

        <div className="stack">
          {(currentUser.role === "ADMIN" || manageUsers) && <SettingsGroup
            title="Tài khoản & truy cập"
            description="Tài khoản, policy, liên kết Zalo và thiết bị Push của thành viên"
            icon="users"
          >
          <div className="stack">
          {currentUser.role === "ADMIN" && <article className="panel zalo-settings-entry">
            <div className="panel-heading"><div><span className="eyebrow">Chủ Tịch Fifa</span><h2>Liên kết Zalo</h2></div><span className="status-pill pending">{pendingZaloRequests.length} chờ duyệt</span></div>
            <p className="panel-note">Duyệt Zalo ID chưa xác định được thành viên, link user hiện có hoặc tạo thành viên mới.</p>
            <Link className="button secondary" href="/settings/zalo-requests">Mở yêu cầu Zalo</Link>
          </article>}

          {manageUsers && <details className="settings-subgroup">
            <summary><span><strong>Tài khoản & policy</strong><small>{accounts.length} tài khoản · phân quyền và liên kết thành viên</small></span><span className="settings-group-chevron" aria-hidden="true" /></summary>

          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Phân quyền</span><h2>Tài khoản & policy</h2></div>
              <Disclosure label="+ Tạo tài khoản" className="inline-disclosure user-create-disclosure">
                <MutationForm action={createUserAccountAction} className="form-stack" closeDisclosureOnSuccess>
                  <label>Tên hiển thị<input name="displayName" required placeholder="Nguyễn Văn A" /></label>
                  <label>Số điện thoại đăng nhập<input name="phone" inputMode="numeric" pattern="[0-9]*" required /></label>
                  <label>Vai trò<select name="role" defaultValue="MEMBER"><option value="MEMBER">Thành viên</option><option value="ORGANIZER">Người tổ chức</option><option value="TREASURER">Thủ quỹ</option>{currentUser.role === "ADMIN" && <option value="ADMIN">Admin</option>}</select></label>
                  <p className="panel-note">Tài khoản được tạo độc lập. Có thể gắn với một thành viên sau.</p>
                  <SubmitButton>Tạo tài khoản</SubmitButton>
                </MutationForm>
              </Disclosure>
            </div>
            <div className="account-list">
              {accounts.map((account) => {
                const accountOverrides = overrideMap.get(account.id);
                return <Disclosure key={account.id} label={<MemberIdentity memberId={account.memberId} userId={account.id} name={account.displayName} avatarVersion={account.avatarUpdatedAt} secondary={`${account.phone} · ${ROLE_LABELS[account.role]} · ${account.memberName ? `Thành viên: ${account.memberName}` : "Không gắn thành viên"}`} />} className="account-disclosure">
                  <MutationForm action={updateUserAccountAction} className="form-stack account-profile-form">
                    <input type="hidden" name="userId" value={account.id} />
                    <label>Tên hiển thị<input name="displayName" defaultValue={account.displayName} required /></label>
                    <label>Số điện thoại đăng nhập<input name="phone" inputMode="numeric" pattern="[0-9]*" defaultValue={account.phone} required /></label>
                    {account.id === currentUser.id && account.role === "ADMIN" ? <><input type="hidden" name="role" value="ADMIN" /><label>Vai trò<input value="Admin" disabled /></label><p className="panel-note">Không thể tự hạ vai trò Admin của tài khoản đang đăng nhập.</p></> : <label>Vai trò<select name="role" defaultValue={account.role}><option value="MEMBER">Thành viên</option><option value="ORGANIZER">Người tổ chức</option><option value="TREASURER">Thủ quỹ</option>{currentUser.role === "ADMIN" && <option value="ADMIN">Admin</option>}</select></label>}
                    <label className="check-field account-active-field"><input name="isActive" type="checkbox" defaultChecked={account.active} disabled={account.id === currentUser.id} /><span><strong>Cho phép đăng nhập</strong><small>{account.id === currentUser.id ? "Không thể tự khóa tài khoản đang dùng." : "Độc lập với trạng thái thành viên."}</small></span></label>
                    <SubmitButton>Lưu tài khoản</SubmitButton>
                  </MutationForm>
                  <div className="account-link-box">
                    {account.memberId ? <MutationForm action={unlinkUserFromMemberAction} className="form-stack compact"><input type="hidden" name="userId" value={account.id} /><div><small>Đang liên kết</small><MemberIdentity memberId={account.memberId} name={account.memberName ?? account.displayName} avatarVersion={account.avatarUpdatedAt} compact /></div><SubmitButton variant="secondary">Tháo liên kết thành viên</SubmitButton></MutationForm> : availableMembers.length ? <MutationForm action={linkUserToMemberAction} className="form-stack compact"><input type="hidden" name="userId" value={account.id} /><SearchableMemberSelect name="memberId" label="Gắn với thành viên" options={availableMembers.map((member) => ({ id: member.id, name: member.name, code: member.code, avatarVersion: member.avatarUpdatedAt }))} required /><SubmitButton variant="secondary">Gắn thành viên</SubmitButton></MutationForm> : <p>Không còn thành viên chưa liên kết.</p>}
                  </div>
                  <form action={saveUserPoliciesAction} className="policy-form">
                    <input type="hidden" name="userId" value={account.id} /><input type="hidden" name="mode" value="custom" />
                    {PERMISSION_DEFINITIONS.map((permission) => {
                      const checked = accountOverrides?.get(permission.key) ?? rolePolicyMap.get(`${account.role}|${permission.key}`) ?? false;
                      return <label className="policy-row" key={permission.key}><input type="checkbox" name="permissions" value={permission.key} defaultChecked={checked} /><span><strong>{permission.name}</strong><small>{permission.description}</small></span></label>;
                    })}
                    <PendingButton className="button primary small" pendingLabel="Đang lưu…">Lưu policy riêng</PendingButton>
                  </form>
                  <div className="account-actions">
                    <form action={saveUserPoliciesAction}><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="mode" value="default" /><PendingButton className="button secondary small" pendingLabel="Đang áp dụng…">Dùng policy vai trò</PendingButton></form>
                    <form action={resetPasswordAction}><input type="hidden" name="userId" value={account.id} /><PendingButton className="button danger small" pendingLabel="Đang đặt lại…">Đặt lại mật khẩu</PendingButton></form>
                  </div>
                </Disclosure>;
              })}
            </div>
          </article>
          </details>}

          {currentUser.role === "ADMIN" && <details className="settings-subgroup">
            <summary><span><strong>Thiết bị Push của thành viên</strong><small>Tra cứu trạng thái thiết bị đã đăng ký</small></span><span className="settings-group-chevron" aria-hidden="true" /></summary>
            <PushDeviceManager />
          </details>}
          </div>
          </SettingsGroup>}

          <SettingsGroup
            title="Thông báo"
            description="Trạng thái PWA, kiểm tra Push và nhắc nợ"
            icon="bell"
            open={currentUser.role !== "ADMIN"}
          >
          <div className="stack">
            <PushNotificationSettings publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} isAdmin={currentUser.role === "ADMIN"} />
            {currentUser.role === "ADMIN" && <DebtReminderTest recipients={accounts.filter((account) => account.active).map((account) => ({ id: account.id, name: account.displayName, phone: account.phone }))} />}
          </div>
          </SettingsGroup>

          <SettingsGroup
            title="Cá nhân & bảo mật"
            description="Ảnh đại diện tài khoản và mật khẩu"
            icon="shield"
          >
          <div className="stack">
          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Cá nhân</span><h2>Avatar tài khoản</h2></div></div>
            <div className="account-avatar-editor">
              <MemberAvatar userId={currentUser.id} memberId={currentUser.memberId} name={currentUser.displayName} avatarVersion={currentUser.avatarUpdatedAt} />
              <MutationForm action={updateOwnAvatarAction} className="form-stack" optimizeAvatar>
                <label>Ảnh đại diện<input name="avatar" type="file" accept="image/*" /></label>
                <p className="panel-note">Ảnh lớn sẽ tự động resize và nén trên thiết bị trước khi tải lên.</p>
                {currentUser.avatarUpdatedAt && <label className="check-field"><input name="removeAvatar" type="checkbox" /> Xóa avatar hiện tại</label>}
                <SubmitButton pendingLabel="Đang tối ưu ảnh…">Lưu avatar</SubmitButton>
              </MutationForm>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Bảo mật</span><h2>Đổi mật khẩu</h2></div></div>
            <MutationForm action={changeOwnPasswordAction} className="form-stack">
              <label>Mật khẩu hiện tại<input name="currentPassword" type="password" required /></label>
              <label>Mật khẩu mới<input name="newPassword" type="password" minLength={8} required /></label>
              <SubmitButton>Đổi mật khẩu</SubmitButton>
            </MutationForm>
          </article>
          </div>
          </SettingsGroup>

          {!manageSettings && club && <SettingsGroup
            title="Thông tin chuyển khoản"
            description="Mã QR và tài khoản nhận tiền của đội"
            icon="credit-card"
          >
            <article className="panel transfer-card">
              <span className="eyebrow">Chuyển khoản</span><h2>{club.bankName || "Thông tin quỹ đội"}</h2>
              {club.qrUrl && <img src={`/api/club-assets/qr?v=${club.updatedAt.getTime()}`} alt="QR chuyển khoản" />}
              <strong>{club.bankAccountNumber}</strong><p>{club.bankAccountHolder}</p>
            </article>
          </SettingsGroup>}
        </div>
      </section>
    </>
  );
}
