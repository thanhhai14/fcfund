import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chargeTypes, memberCharges, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import {
  createMemberChargeAction,
  softDeleteFinancialAction,
  updateMemberChargeAction,
} from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Khoản phải thu" };

export default async function ChargesPage() {
  const user = await requireUser();
  const canViewAll = await can(PERMISSIONS.CHARGES_VIEW_ALL);
  const canViewOwn = await can(PERMISSIONS.CHARGES_VIEW_OWN);
  if (!canViewAll && !canViewOwn) redirect("/dashboard");
  const canManage = await can(PERMISSIONS.CHARGES_MANAGE);

  const conditions = [
    eq(memberCharges.clubId, user.clubId),
    isNull(memberCharges.deletedAt),
  ];
  if (!canViewAll && user.memberId) conditions.push(eq(memberCharges.memberId, user.memberId));

  const rows = await db
    .select({
      id: memberCharges.id,
      memberId: memberCharges.memberId,
      memberName: members.fullName,
      typeName: chargeTypes.name,
      iconName: chargeTypes.iconName,
      source: memberCharges.source,
      date: memberCharges.chargeDate,
      quantity: memberCharges.quantity,
      unitAmount: memberCharges.unitAmount,
      totalAmount: memberCharges.totalAmount,
      note: memberCharges.note,
    })
    .from(memberCharges)
    .innerJoin(members, eq(memberCharges.memberId, members.id))
    .innerJoin(chargeTypes, eq(memberCharges.chargeTypeId, chargeTypes.id))
    .where(and(...conditions))
    .orderBy(desc(memberCharges.chargeDate), desc(memberCharges.createdAt));

  const memberRows = canManage ? await db.select().from(members)
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE")))
    .orderBy(members.fullName) : [];
  const typeRows = canManage ? await db.select().from(chargeTypes)
    .where(and(eq(chargeTypes.clubId, user.clubId), eq(chargeTypes.isActive, true)))
    .orderBy(chargeTypes.name) : [];
  const total = rows.reduce((sum, row) => sum + row.totalAmount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Công nợ"
        title="Khoản phải thu"
        description="Các nghĩa vụ làm giảm số dư thành viên"
        action={canManage ? (
          <Disclosure label={<><Icon name="plus" /> Thêm khoản thu</>} className="action-disclosure">
            <MutationForm action={createMemberChargeAction} className="form-grid">
              <label>Thành viên<select name="memberId" required>{memberRows.map((member) => <option value={member.id} key={member.id}>{member.fullName}</option>)}</select></label>
              <label>Loại thu<select name="chargeTypeId" required>{typeRows.map((type) => <option value={type.id} key={type.id}>{type.name} · {formatMoney(type.defaultAmount)}</option>)}</select></label>
              <label>Số lần<input name="quantity" type="number" min="1" defaultValue={1} required /></label>
              <label>Đơn giá riêng<input name="unitAmount" type="number" min="0" placeholder="Để trống dùng mặc định" /></label>
              <label>Ngày phát sinh<input name="chargeDate" type="date" defaultValue={todayInTimezone()} required /></label>
              <label>Ghi chú<input name="note" placeholder="Nội dung phát sinh" /></label>
              <div className="form-actions full"><SubmitButton>Tạo khoản phải thu</SubmitButton></div>
            </MutationForm>
          </Disclosure>
        ) : undefined}
      />

      <div className="summary-line">
        <span><strong>{rows.length}</strong> khoản phát sinh</span>
        <span><strong>{formatMoney(total)}</strong> tổng phải thu</span>
      </div>

      <article className="panel table-panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Thành viên</th><th>Loại thu</th><th>Ngày</th><th>Số lượng</th><th className="align-right">Số tiền</th>{canManage && <th />}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.memberName}</strong><small>{row.note || "Không có ghi chú"}</small></td>
                  <td><span className="category-pill"><Icon name={row.iconName} /> {row.typeName}</span></td>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.quantity} × {formatMoney(row.unitAmount)}</td>
                  <td className="align-right"><strong className="money-out">{formatMoney(row.totalAmount)}</strong></td>
                  {canManage && <td>
                    <Disclosure label="•••" className="row-disclosure">
                      <MutationForm action={updateMemberChargeAction} className="form-stack compact">
                        <input type="hidden" name="id" value={row.id} />
                        <label>Số lượng<input name="quantity" type="number" min="1" defaultValue={row.quantity} /></label>
                        <label>Đơn giá<input name="unitAmount" type="number" min="0" defaultValue={row.unitAmount} /></label>
                        <label>Ngày<input name="chargeDate" type="date" defaultValue={row.date} /></label>
                        <label>Ghi chú<input name="note" defaultValue={row.note ?? ""} /></label>
                        <SubmitButton>Lưu thay đổi</SubmitButton>
                      </MutationForm>
                      <form action={softDeleteFinancialAction}>
                        <input type="hidden" name="id" value={row.id} /><input type="hidden" name="entity" value="charge" />
                        <button className="button danger wide small">Xóa khoản này</button>
                      </form>
                    </Disclosure>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="empty-state"><span><Icon name="coins" /></span><h3>Chưa có khoản phải thu</h3><p>Khoản định kỳ sẽ tự sinh vào ngày đầu tháng.</p></div>}
      </article>
    </>
  );
}
