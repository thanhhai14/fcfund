import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chargeTypes,
  avatars,
  fundCategories,
  fundTransactions,
  memberCharges,
  members,
  matches,
  matchTeams,
  matchTeamVersions,
} from "@/db/schema";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/constants";
import { formatDate, formatLongDate, formatMoney, monthStart, todayInTimezone } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { getMatchResultChargeTypeId } from "@/lib/match-lifecycle";
import { MemberIdentity } from "@/components/member-identity";

export const metadata = { title: "Tổng quan" };

function metricNumberRecord(metrics: unknown, key: string): Record<string, number> {
  if (typeof metrics === "string") {
    try {
      return metricNumberRecord(JSON.parse(metrics), key);
    } catch {
      return {};
    }
  }
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return {};
  const value = (metrics as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, amount]) =>
    typeof amount === "number" && Number.isFinite(amount) ? [[name, amount]] : [],
  ));
}

export default async function DashboardPage() {
  const user = await requireUser();
  const showClubBalance = await can(PERMISSIONS.CLUB_BALANCE_VIEW);
  const showOtherBalances = await can(PERMISSIONS.OTHER_MEMBER_BALANCES_VIEW);
  const today = todayInTimezone();
  const currentMonth = monthStart();

  const [fundSummary] = await db
    .select({
      income: sql<string>`COALESCE(SUM(CASE WHEN ${fundTransactions.direction} = 'IN' THEN ${fundTransactions.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${fundTransactions.direction} = 'OUT' THEN ${fundTransactions.amount} ELSE 0 END), 0)`,
      monthIncome: sql<string>`COALESCE(SUM(CASE WHEN ${fundTransactions.direction} = 'IN' AND ${fundTransactions.transactionDate} >= ${currentMonth} THEN ${fundTransactions.amount} ELSE 0 END), 0)`,
      monthExpense: sql<string>`COALESCE(SUM(CASE WHEN ${fundTransactions.direction} = 'OUT' AND ${fundTransactions.transactionDate} >= ${currentMonth} THEN ${fundTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(fundTransactions)
    .where(and(eq(fundTransactions.clubId, user.clubId), isNull(fundTransactions.deletedAt)));

  const chargeSums = await db
    .select({
      memberId: memberCharges.memberId,
      amount: sql<string>`COALESCE(SUM(${memberCharges.totalAmount}), 0)`,
    })
    .from(memberCharges)
    .where(and(eq(memberCharges.clubId, user.clubId), isNull(memberCharges.deletedAt)))
    .groupBy(memberCharges.memberId);

  const paymentSums = await db
    .select({
      memberId: fundTransactions.memberId,
      amount: sql<string>`COALESCE(SUM(${fundTransactions.amount}), 0)`,
    })
    .from(fundTransactions)
    .where(
      and(
        eq(fundTransactions.clubId, user.clubId),
        eq(fundTransactions.kind, "MEMBER_PAYMENT"),
        isNull(fundTransactions.deletedAt),
      ),
    )
    .groupBy(fundTransactions.memberId);

  const memberRows = await db
    .select({ id: members.id, name: members.fullName, code: members.code, avatarUpdatedAt: avatars.updatedAt })
    .from(members)
    .leftJoin(avatars, eq(members.id, avatars.memberId))
    .where(and(eq(members.clubId, user.clubId), eq(members.status, "ACTIVE")));

  const chargeMap = new Map(chargeSums.map((row) => [row.memberId, Number(row.amount)]));
  const paymentMap = new Map(paymentSums.map((row) => [row.memberId, Number(row.amount)]));
  const balances = memberRows.map((member) => ({
    ...member,
    paid: paymentMap.get(member.id) ?? 0,
    charged: chargeMap.get(member.id) ?? 0,
    balance: (paymentMap.get(member.id) ?? 0) - (chargeMap.get(member.id) ?? 0),
  }));
  const totalDebt = balances.reduce((sum, row) => sum + Math.max(-row.balance, 0), 0);
  const ownBalance = balances.find((row) => row.id === user.memberId);

  const recent = await db
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
    })
    .from(fundTransactions)
    .leftJoin(members, eq(fundTransactions.memberId, members.id))
    .leftJoin(avatars, eq(fundTransactions.memberId, avatars.memberId))
    .leftJoin(fundCategories, eq(fundTransactions.categoryId, fundCategories.id))
    .where(and(eq(fundTransactions.clubId, user.clubId), isNull(fundTransactions.deletedAt)))
    .orderBy(desc(fundTransactions.transactionDate), desc(fundTransactions.createdAt))
    .limit(6);

  const monthlyTypes = await db
    .select({
      name: chargeTypes.name,
      amount: chargeTypes.defaultAmount,
      color: chargeTypes.color,
      iconName: chargeTypes.iconName,
    })
    .from(chargeTypes)
    .where(and(eq(chargeTypes.clubId, user.clubId), eq(chargeTypes.isActive, true)))
    .limit(4);

  const [latestMatch] = await db.select({
    id: matches.id,
    playedOn: matches.playedOn,
    note: matches.note,
    versionId: matchTeamVersions.id,
    metrics: matchTeamVersions.metrics,
  })
    .from(matches)
    .innerJoin(matchTeamVersions, and(
      eq(matchTeamVersions.matchId, matches.id),
      eq(matchTeamVersions.status, "CONFIRMED"),
    ))
    .where(and(
      eq(matches.clubId, user.clubId),
      isNull(matches.deletedAt),
      isNull(matches.hiddenAt),
      lte(matches.playedOn, today),
    ))
    .orderBy(desc(matches.playedOn), desc(matches.createdAt))
    .limit(1);

  const latestTeams = latestMatch
    ? await db.select({
        id: matchTeams.id,
        name: matchTeams.name,
        memberCount: matchTeams.memberCount,
        teamIndex: matchTeams.teamIndex,
      }).from(matchTeams)
        .where(eq(matchTeams.versionId, latestMatch.versionId))
        .orderBy(matchTeams.teamIndex)
    : [];

  const latestPlacements = latestMatch ? metricNumberRecord(latestMatch.metrics, "placements") : {};
  const latestChargeQuantities = latestMatch ? metricNumberRecord(latestMatch.metrics, "penaltyQuantities") : {};
  const latestResultChargeTypeId = latestMatch ? getMatchResultChargeTypeId(latestMatch.metrics) : null;
  const [latestResultChargeType] = latestResultChargeTypeId
    ? await db.select({
        id: chargeTypes.id,
        name: chargeTypes.name,
        iconName: chargeTypes.iconName,
        color: chargeTypes.color,
        reportAsIcon: chargeTypes.reportAsIcon,
      }).from(chargeTypes)
        .where(and(eq(chargeTypes.id, latestResultChargeTypeId), eq(chargeTypes.clubId, user.clubId)))
        .limit(1)
    : [];

  const income = Number(fundSummary?.income ?? 0);
  const expense = Number(fundSummary?.expense ?? 0);

  return (
    <>
      <PageHeader
        eyebrow={formatLongDate()}
        title={`Chào ${user.displayName.trim() || "bạn"}!`}
        description="Đây là tình hình quỹ và công nợ mới nhất của đội."
      />

      <section className="hero-balance">
        <div>
          <span>{showClubBalance ? "Số dư quỹ hiện tại" : "Số dư của bạn"}</span>
          <strong>{showClubBalance ? formatMoney(income - expense) : user.memberId ? formatMoney(ownBalance?.balance ?? 0) : "—"}</strong>
          <small>Cập nhật đến {formatDate(todayInTimezone())}</small>
        </div>
        <div className="hero-mark"><Icon name="futbol" /></div>
        <div className="hero-breakdown">
          {showClubBalance ? (
            <>
              <div><span>Thu tháng này</span><strong>+{formatMoney(Number(fundSummary?.monthIncome ?? 0))}</strong></div>
              <div><span>Chi tháng này</span><strong>-{formatMoney(Number(fundSummary?.monthExpense ?? 0))}</strong></div>
            </>
          ) : user.memberId ? (
            <>
              <div><span>Đã nộp</span><strong>{formatMoney(ownBalance?.paid ?? 0)}</strong></div>
              <div><span>Phải đóng</span><strong>{formatMoney(ownBalance?.charged ?? 0)}</strong></div>
            </>
          ) : (
            <div className="unlinked-personal-data"><span>Dữ liệu cá nhân</span><strong>Chưa liên kết thành viên</strong></div>
          )}
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span className="stat-icon green"><Icon name="money-bill-wave" /></span>
          <div><small>Thực thu tháng này</small><strong>{formatMoney(Number(fundSummary?.monthIncome ?? 0))}</strong><span>Tiền đã vào quỹ</span></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon orange"><Icon name="transactions" /></span>
          <div><small>Thực chi tháng này</small><strong>{formatMoney(Number(fundSummary?.monthExpense ?? 0))}</strong><span>Các khoản đã chi</span></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon red"><Icon name="triangle-exclamation" /></span>
          <div><small>Công nợ toàn đội</small><strong>{showOtherBalances ? formatMoney(totalDebt) : "Ẩn theo policy"}</strong><span>{balances.filter((row) => row.balance < 0).length} người còn nợ</span></div>
        </article>
      </section>

      {latestMatch && (
        <section className="dashboard-latest-match">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Trận đấu gần nhất</span>
                <h2>{latestMatch.note || `Trận ngày ${formatDate(latestMatch.playedOn)}`}</h2>
              </div>
              <a href={`/matches/${latestMatch.id}`} className="text-link">Xem chi tiết →</a>
            </div>

            <div className="activity-list">
              {latestTeams.map((team) => {
                const place = latestPlacements[team.name] ?? null;
                const quantity = latestChargeQuantities[team.name] ?? 0;
                return (
                  <div className="activity-item" key={team.id}>
                    <span className="activity-icon in"><Icon name="people-group" /></span>
                    <div>
                      <strong>{team.name}</strong>
                      <small>{team.memberCount} cầu thủ · {place ? `Hạng ${place}` : "Chưa ghi kết quả"}</small>
                    </div>
                    <b>
                      {latestResultChargeType ? (
                        latestResultChargeType.reportAsIcon ? (
                          <span
                            className="icon-count"
                            style={{ color: latestResultChargeType.color ?? undefined }}
                            title={`${latestResultChargeType.name} · ${quantity} lần`}
                          >
                            {quantity > 0
                              ? Array.from({ length: quantity }, (_, index) => (
                                  <Icon name={latestResultChargeType.iconName} key={index} />
                                ))
                              : <><Icon name={latestResultChargeType.iconName} /><small>×0</small></>}
                          </span>
                        ) : (
                          <span>{latestResultChargeType.name}: {quantity} lần</span>
                        )
                      ) : place ? (
                        <span>Chưa có loại thu phạt</span>
                      ) : (
                        <span>—</span>
                      )}
                    </b>
                  </div>
                );
              })}
              {!latestTeams.length && <p className="muted">Trận gần nhất chưa có đội hình đã xác nhận.</p>}
            </div>
          </article>
        </section>
      )}

      <section className="dashboard-columns">
        <article className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Dòng tiền</span><h2>Giao dịch gần đây</h2></div>
            <a href="/transactions" className="text-link">Xem tất cả →</a>
          </div>
          <div className="activity-list">
            {recent.map((item) => (
              <div className="activity-item" key={item.id}>
                <span className={`activity-icon ${item.direction === "IN" ? "in" : "out"}`}>
                  <Icon name={item.direction === "IN" ? "money-bill-wave" : "transactions"} />
                </span>
                {item.memberName && item.memberId ? <MemberIdentity memberId={item.memberId} name={item.memberName} avatarVersion={item.avatarUpdatedAt} secondary={`${item.note || item.categoryName || "Không có ghi chú"} · ${formatDate(item.date)}`} compact /> : <div><strong>{item.categoryName ?? (item.direction === "IN" ? "Khoản thu" : "Khoản chi")}</strong><small>{item.note || item.categoryName || "Không có ghi chú"} · {formatDate(item.date)}</small></div>}
                <b className={item.direction === "IN" ? "money-in" : "money-out"}>
                  {item.direction === "IN" ? "+" : "-"}{formatMoney(item.amount)}
                </b>
              </div>
            ))}
            {!recent.length && <p className="muted">Chưa có giao dịch nào.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Công nợ</span><h2>Cần chú ý</h2></div>
            <a href="/reports" className="text-link">Báo cáo →</a>
          </div>
          {showOtherBalances ? (
            <div className="debt-list">
              {balances.filter((row) => row.balance < 0).sort((a, b) => a.balance - b.balance).slice(0, 6).map((row) => (
                <div key={row.id}>
                  <MemberIdentity memberId={row.id} name={row.name} avatarVersion={row.avatarUpdatedAt} compact />
                  <b>{formatMoney(-row.balance)}</b>
                </div>
              ))}
              {!balances.some((row) => row.balance < 0) && <p className="muted">Không có thành viên đang nợ.</p>}
            </div>
          ) : user.memberId ? (
            <div className="own-balance">
              <span className={`balance-pill ${(ownBalance?.balance ?? 0) < 0 ? "debt" : "credit"}`}>
                {(ownBalance?.balance ?? 0) < 0 ? "Còn nợ" : "Số dư"}
              </span>
              <strong>{formatMoney(Math.abs(ownBalance?.balance ?? 0))}</strong>
              <p>Policy của bạn chỉ cho phép xem công nợ cá nhân.</p>
            </div>
          ) : (
            <div className="own-balance"><span className="balance-pill">Chưa liên kết</span><strong>Không có dữ liệu cá nhân</strong><p>Tài khoản vẫn sử dụng được các chức năng khác theo policy hiện tại.</p></div>
          )}
        </article>
      </section>

      <section className="type-strip">
        {monthlyTypes.map((type) => (
          <article key={type.name}>
            <span style={{ backgroundColor: type.color ? `${type.color}18` : undefined, color: type.color ?? undefined }}><Icon name={type.iconName} /></span>
            <div><small>{type.name}</small><strong>{formatMoney(type.amount)}</strong></div>
          </article>
        ))}
      </section>
    </>
  );
}
