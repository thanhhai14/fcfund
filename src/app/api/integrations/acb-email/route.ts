import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { acbEmailImports, acbEmailSettings, activityLogs, fundCategories, fundTransactions, members } from "@/db/schema";
import { emailHash, hasAcbAuthentication, normalizeSubject, parseAcbEmail } from "@/lib/acb-email-parser";
import { notifyUsers, userIdsForMembers } from "@/lib/push-notifications";

export const runtime = "nodejs";
const payloadSchema = z.object({
  messageId: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/), mailbox: z.email().max(254),
  receivedAt: z.iso.datetime(), sender: z.string().max(320), subject: z.string().max(500),
  body: z.string().max(20000), authenticationResults: z.array(z.string().max(8000)).max(10),
});

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.match(/^Bearer (fcf_acb_[a-f0-9]{64})$/)?.[1];
  if (!key) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [setting] = await db.select().from(acbEmailSettings).where(eq(acbEmailSettings.keyHash, emailHash(key))).limit(1);
  if (!setting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (setting.mode === "OFF") return NextResponse.json({ error: "Integration disabled" }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 100000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const validation = payloadSchema.safeParse(json);
  if (!validation.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const data = validation.data;
  const receivedAt = new Date(data.receivedAt);
  const result = await db.transaction(async (tx) => {
    // Serialize all imports/config changes for this club: duplicates and rotation are atomic.
    const [current] = await tx.select().from(acbEmailSettings).where(eq(acbEmailSettings.clubId, setting.clubId)).for("update");
    if (!current || current.keyHash !== emailHash(key) || current.mode === "OFF") return { status: "DISABLED", code: 403 };
    const [existing] = await tx.select().from(acbEmailImports).where(and(
      eq(acbEmailImports.clubId, current.clubId), eq(acbEmailImports.mailbox, data.mailbox.toLowerCase()), eq(acbEmailImports.messageId, data.messageId),
    )).limit(1);
    if (existing) return { status: existing.status, code: 200 };
    const [rate] = await tx.select({ count: sql<number>`count(*)::int` }).from(acbEmailImports).where(and(eq(acbEmailImports.clubId, current.clubId), gte(acbEmailImports.createdAt, new Date(Date.now() - 60000))));
    if (rate.count >= 30) return { status: "RATE_LIMITED", code: 429 };
    const parsed = parseAcbEmail(data.body);
    const sender = data.sender.match(/<([^<>]+)>/)?.[1] ?? data.sender.trim();
    let reason = "";
    if (data.mailbox.toLowerCase() !== current.mailbox.toLowerCase()) reason = "Sai hộp thư";
    else if (sender.toLowerCase() !== current.sender.toLowerCase()) reason = "Sai người gửi";
    else if (normalizeSubject(data.subject) !== normalizeSubject(current.subject)) reason = "Sai tiêu đề";
    else if (!hasAcbAuthentication(data.authenticationResults)) reason = "Email chưa đạt xác thực DKIM/DMARC của Gmail";
    else if (receivedAt.getTime() > Date.now() + 300000) reason = "Thời điểm email không hợp lệ";
    else if (current.mode === "LIVE" && (!current.activatedAt || receivedAt < current.activatedAt)) reason = "Email trước mốc bật chính thức";
    else if (!parsed) reason = "Không phải Ghi có hợp lệ hoặc không có đúng một mã thanh toán";
    else if (parsed.account !== current.accountPattern) reason = "Sai tài khoản nhận";
    const [member] = !reason && parsed ? await tx.select().from(members).where(and(eq(members.clubId, current.clubId), eq(members.paymentReference, parsed.reference), eq(members.status, "ACTIVE"))).limit(1) : [];
    if (!reason && !member) reason = "Không tìm thấy thành viên hoạt động của CLB";
    const fingerprint = parsed ? emailHash(`${current.clubId}|${parsed.account}|${parsed.transactionDate}|${parsed.amount}|${parsed.content.toUpperCase().replace(/\s+/g, " ")}`) : null;
    const [duplicate] = !reason && fingerprint ? await tx.select({ id: acbEmailImports.id }).from(acbEmailImports).where(and(eq(acbEmailImports.clubId, current.clubId), eq(acbEmailImports.fingerprint, fingerprint), ne(acbEmailImports.status, "IGNORED"))).limit(1) : [];
    const [manual] = !reason && member && parsed ? await tx.select({ id: fundTransactions.id }).from(fundTransactions).where(and(eq(fundTransactions.clubId, current.clubId), eq(fundTransactions.memberId, member.id), eq(fundTransactions.kind, "MEMBER_PAYMENT"), eq(fundTransactions.amount, parsed.amount), eq(fundTransactions.transactionDate, parsed.transactionDate), isNull(fundTransactions.deletedAt))).limit(1) : [];
    const status = reason ? "IGNORED" : duplicate || manual ? "REVIEW_REQUIRED" : current.mode === "SIMULATE" ? "SIMULATED" : "RECORDED";
    reason ||= status === "REVIEW_REQUIRED" ? "Nghi trùng giao dịch đã có; đối chiếu thủ công" : status === "SIMULATED" ? "Mô phỏng, chưa cộng tiền" : "Đã ghi nhận tiền nộp";
    let transactionId: string | null = null;
    if (status === "RECORDED" && member && parsed) {
      const [category] = await tx.select({ id: fundCategories.id }).from(fundCategories).where(and(eq(fundCategories.clubId, current.clubId), eq(fundCategories.isSystem, true), eq(fundCategories.direction, "IN"))).limit(1);
      const [record] = await tx.insert(fundTransactions).values({ clubId: current.clubId, memberId: member.id, direction: "IN", kind: "MEMBER_PAYMENT", source: "ACB_EMAIL", amount: parsed.amount, transactionDate: parsed.transactionDate, note: parsed.content, categoryId: category?.id }).returning();
      transactionId = record.id;
      await tx.insert(activityLogs).values({ clubId: current.clubId, entityType: "fund_transaction", entityId: record.id, action: "CREATE", afterData: record, message: "API ACB tự động ghi nhận tiền thành viên nộp" });
    }
    await tx.insert(acbEmailImports).values({ clubId: current.clubId, messageId: data.messageId, mailbox: data.mailbox.toLowerCase(), receivedAt, status, reason, fingerprint, amount: parsed?.amount, transactionDate: parsed?.transactionDate, content: parsed?.content, memberId: member?.id, transactionId });
    await tx.update(acbEmailSettings).set({ lastReceivedAt: new Date() }).where(eq(acbEmailSettings.clubId, current.clubId));
    return { status, code: 200, transactionId, memberId: member?.id, clubId: current.clubId };
  });
  if (result.transactionId && result.memberId && result.clubId) {
    try {
      await notifyUsers({ clubId: result.clubId, userIds: await userIdsForMembers(result.clubId, [result.memberId]), type: "MEMBER_PAYMENT_RECORDED", title: "Đã ghi nhận tiền nộp", body: "Khoản tiền bạn nộp đã được ghi nhận vào quỹ.", url: "/reports", entityType: "fund_transaction", entityId: result.transactionId, dedupeKey: `MEMBER_PAYMENT_RECORDED:${result.transactionId}` });
    } catch { /* Payment has already committed. */ }
    for (const path of ["/transactions", "/reports", "/dashboard", `/members/${result.memberId}`]) revalidatePath(path);
  }
  return NextResponse.json({ status: result.status }, { status: result.code });
}
