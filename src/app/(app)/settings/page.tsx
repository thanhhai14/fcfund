/* eslint-disable @next/next/no-img-element */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  chargeTypes,
  clubs,
  fundCategories,
  members,
  rolePermissions,
  userPermissionOverrides,
  users,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import {
  changeOwnPasswordAction,
  createChargeTypeAction,
  createFundCategoryAction,
  resetPasswordAction,
  saveUserPoliciesAction,
  updateClubAction,
} from "../mutations";
import { can } from "@/lib/permissions";
import {
  ICON_ALLOWLIST,
  PERMISSION_DEFINITIONS,
  PERMISSIONS,
  ROLE_LABELS,
} from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Cài đặt" };

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const manageSettings = await can(PERMISSIONS.SETTINGS_MANAGE);
  const manageUsers = await can(PERMISSIONS.USERS_MANAGE);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, currentUser.clubId)).limit(1);
  const types = manageSettings ? await db.select().from(chargeTypes)
    .where(eq(chargeTypes.clubId, currentUser.clubId)).orderBy(chargeTypes.name) : [];
  const categories = manageSettings ? await db.select().from(fundCategories)
    .where(eq(fundCategories.clubId, currentUser.clubId)).orderBy(fundCategories.direction, fundCategories.name) : [];
  const accounts = manageUsers ? await db
    .select({
      id: users.id, phone: users.phoneNormalized, role: users.role, active: users.isActive,
      memberName: members.fullName,
    })
    .from(users).leftJoin(members, eq(users.memberId, members.id))
    .where(eq(users.clubId, currentUser.clubId)).orderBy(users.role, members.fullName) : [];
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
      <section className="settings-layout">
        <div className="stack">
          {manageSettings && club && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Nhận diện</span><h2>Thông tin đội bóng</h2></div></div>
            <MutationForm action={updateClubAction} className="form-stack">
              <label>Tên đội bóng<input name="name" defaultValue={club.name} required /></label>
              <div className="form-row"><label>Logo đội<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label><label>Ảnh QR<input name="qr" type="file" accept="image/png,image/jpeg,image/webp" /></label></div>
              <div className="form-row"><label>Ngân hàng<input name="bankName" defaultValue={club.bankName ?? ""} /></label><label>Số tài khoản<input name="bankAccountNumber" defaultValue={club.bankAccountNumber ?? ""} /></label></div>
              <label>Chủ tài khoản<input name="bankAccountHolder" defaultValue={club.bankAccountHolder ?? ""} /></label>
              <SubmitButton>Lưu thông tin đội</SubmitButton>
            </MutationForm>
            {(club.logoUrl || club.qrUrl) && <div className="asset-preview">{club.logoUrl && <div><small>Logo</small><img src={`/api/club-assets/logo?v=${club.updatedAt.getTime()}`} alt="Logo đội" /></div>}{club.qrUrl && <div><small>QR chuyển khoản</small><img src={`/api/club-assets/qr?v=${club.updatedAt.getTime()}`} alt="QR chuyển khoản" /></div>}</div>}
          </article>}

          {manageSettings && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Cấu hình</span><h2>Loại khoản thu</h2></div>
              <Disclosure label="+ Tạo loại thu" className="inline-disclosure">
                <MutationForm action={createChargeTypeAction} className="form-stack">
                  <label>Tên loại thu<input name="name" required /></label>
                  <div className="form-row"><label>Cách tính<select name="calculation"><option value="MONTHLY">Theo tháng</option><option value="OCCURRENCE">Theo số lần</option></select></label><label>Đơn giá<input name="amount" type="number" min="0" required /></label></div>
                  <label>Font Awesome icon<select name="iconName">{ICON_ALLOWLIST.map((icon) => <option value={icon} key={icon}>{icon}</option>)}</select></label>
                  <label>Màu<input name="color" type="color" defaultValue="#2e7d58" /></label>
                  <SubmitButton>Tạo loại thu</SubmitButton>
                </MutationForm>
              </Disclosure>
            </div>
            <div className="settings-list">{types.map((type) => <div key={type.id}><span className="stat-icon green" style={{ color: type.color ?? undefined }}><Icon name={type.iconName} /></span><span><strong>{type.name}</strong><small>{type.calculation === "MONTHLY" ? "Tự sinh hằng tháng" : "Admin cập nhật số lần"}</small></span><b>{formatMoney(type.defaultAmount)}</b></div>)}</div>
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

        <div className="stack">
          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Bảo mật</span><h2>Đổi mật khẩu</h2></div></div>
            <MutationForm action={changeOwnPasswordAction} className="form-stack">
              <label>Mật khẩu hiện tại<input name="currentPassword" type="password" required /></label>
              <label>Mật khẩu mới<input name="newPassword" type="password" minLength={8} required /></label>
              <SubmitButton>Đổi mật khẩu</SubmitButton>
            </MutationForm>
          </article>

          {manageUsers && <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Phân quyền</span><h2>Tài khoản & policy</h2></div></div>
            <div className="account-list">
              {accounts.map((account) => {
                const accountOverrides = overrideMap.get(account.id);
                return <Disclosure key={account.id} label={<><span className="avatar">{(account.memberName ?? account.phone).slice(0, 2)}</span><span><strong>{account.memberName ?? "Quản trị viên"}</strong><small>{account.phone} · {ROLE_LABELS[account.role]}</small></span></>} className="account-disclosure">
                  <form action={saveUserPoliciesAction} className="policy-form">
                    <input type="hidden" name="userId" value={account.id} /><input type="hidden" name="mode" value="custom" />
                    {PERMISSION_DEFINITIONS.map((permission) => {
                      const checked = accountOverrides?.get(permission.key) ?? rolePolicyMap.get(`${account.role}|${permission.key}`) ?? false;
                      return <label className="policy-row" key={permission.key}><input type="checkbox" name="permissions" value={permission.key} defaultChecked={checked} /><span><strong>{permission.name}</strong><small>{permission.description}</small></span></label>;
                    })}
                    <button className="button primary small">Lưu policy riêng</button>
                  </form>
                  <div className="account-actions">
                    <form action={saveUserPoliciesAction}><input type="hidden" name="userId" value={account.id} /><input type="hidden" name="mode" value="default" /><button className="button secondary small">Dùng policy vai trò</button></form>
                    <form action={resetPasswordAction}><input type="hidden" name="userId" value={account.id} /><button className="button danger small">Đặt lại mật khẩu</button></form>
                  </div>
                </Disclosure>;
              })}
            </div>
          </article>}

          {!manageSettings && club && <article className="panel transfer-card">
            <span className="eyebrow">Chuyển khoản</span><h2>{club.bankName || "Thông tin quỹ đội"}</h2>
            {club.qrUrl && <img src={`/api/club-assets/qr?v=${club.updatedAt.getTime()}`} alt="QR chuyển khoản" />}
            <strong>{club.bankAccountNumber}</strong><p>{club.bankAccountHolder}</p>
          </article>}
        </div>
      </section>
    </>
  );
}
