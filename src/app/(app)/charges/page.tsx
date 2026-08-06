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
} from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { ChargesCollection } from "@/components/charges-collection";

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

      <ChargesCollection rows={rows} canManage={canManage} />
    </>
  );
}
