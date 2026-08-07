import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { avatars, fundCategories, fundTransactions, matches, members } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { Disclosure } from "@/components/disclosure";
import { Icon } from "@/components/icon";
import { MutationForm, SubmitButton } from "@/components/mutation-form";
import {
  createFundTransactionAction,
} from "../mutations";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatMoney, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { SearchableMemberSelect } from "@/components/searchable-member-select";
import { TransactionsCollection } from "@/components/transactions-collection";

export const metadata = { title: "Thu & chi" };

export default async function TransactionsPage() {
  const user = await requireUser();
  if (!(await can(PERMISSIONS.EXPENSES_VIEW))) redirect("/dashboard");
  const canManage = await can(PERMISSIONS.EXPENSES_MANAGE);

  const rows = await db
    .select({
      id: fundTransactions.id,
      direction: fundTransactions.direction,
      kind: fundTransactions.kind,
      amount: fundTransactions.amount,
      date: fundTransactions.transactionDate,
      note: fundTransactions.note,
      memberId: fundTransactions.memberId,
      memberName: members.fullName,
      avatarUpdatedAt: avatars.updatedAt,
      categoryName: fundCategories.name,
      matchDate: matches.playedOn,
    })
    .from(fundTransactions)
    .leftJoin(members, eq(fundTransactions.memberId, members.id))
    .leftJoin(avatars, eq(members.id, avatars.memberId))
    .leftJoin(fundCategories, eq(fundTransactions.categoryId, fundCategories.id))
    .leftJoin(matches, eq(fundTransactions.matchId, matches.id))
    .where(and(eq(fundTransactions.clubId, user.clubId), isNull(fundTransactions.deletedAt)))
    .orderBy(desc(fundTransactions.transactionDate), desc(fundTransactions.createdAt));
  const memberRows = canManage ? await db.select({ id: members.id, fullName: members.fullName, code: members.code, phone: members.phone, avatarUpdatedAt: avatars.updatedAt }).from(members).leftJoin(avatars, eq(members.id, avatars.memberId))
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE"))).orderBy(members.fullName) : [];
  const categories = canManage ? await db.select().from(fundCategories)
    .where(and(eq(fundCategories.clubId, user.clubId), eq(fundCategories.isActive, true))).orderBy(fundCategories.direction, fundCategories.name) : [];
  const matchRows = canManage ? await db.select().from(matches)
    .where(and(eq(matches.clubId, user.clubId), isNull(matches.deletedAt))).orderBy(desc(matches.playedOn)).limit(30) : [];
  const income = rows.filter((row) => row.direction === "IN").reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter((row) => row.direction === "OUT").reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Sổ tiền quỹ"
        title="Thu & chi"
        description="Chỉ phản ánh tiền thực tế đã vào hoặc ra khỏi quỹ"
        action={canManage ? (
          <Disclosure label={<><Icon name="plus" /> Thêm giao dịch</>} className="action-disclosure wide-popover">
            <MutationForm action={createFundTransactionAction} className="form-grid">
              <label>Loại giao dịch<select name="kind" required>
                <option value="MEMBER_PAYMENT">Thành viên nộp tiền</option>
                <option value="OTHER_INCOME">Thu khác</option>
                <option value="EXPENSE">Khoản chi</option>
                <option value="ADJUSTMENT">Điều chỉnh quỹ</option>
              </select></label>
              <SearchableMemberSelect name="memberId" options={memberRows.map((member) => ({ id: member.id, name: member.fullName, code: member.code, phone: member.phone, avatarVersion: member.avatarUpdatedAt }))} emptyLabel="Không gắn thành viên" />
              <label>Danh mục<select name="categoryId"><option value="">Không chọn</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.direction === "IN" ? "Thu" : "Chi"} · {category.name}</option>)}</select></label>
              <label>Số tiền<input name="amount" type="number" min="1" required /></label>
              <label>Ngày giao dịch<input name="transactionDate" type="date" defaultValue={todayInTimezone()} required /></label>
              <label>Gắn với trận<select name="matchId"><option value="">Không gắn trận</option>{matchRows.map((match) => <option value={match.id} key={match.id}>{formatDate(match.playedOn)}</option>)}</select></label>
              <label className="full">Ghi chú<textarea name="note" rows={2} placeholder="Nội dung thu/chi" /></label>
              <div className="form-actions full"><SubmitButton>Lưu giao dịch</SubmitButton></div>
            </MutationForm>
          </Disclosure>
        ) : undefined}
      />

      <section className="mini-stat-grid">
        <article><span className="stat-icon green"><Icon name="money-bill-wave" /></span><div><small>Tổng thực thu</small><strong>{formatMoney(income)}</strong></div></article>
        <article><span className="stat-icon orange"><Icon name="transactions" /></span><div><small>Tổng thực chi</small><strong>{formatMoney(expense)}</strong></div></article>
        <article><span className="stat-icon green"><Icon name="wallet" /></span><div><small>Số dư quỹ</small><strong>{formatMoney(income - expense)}</strong></div></article>
      </section>

      <TransactionsCollection rows={rows} canManage={canManage} />
    </>
  );
}
