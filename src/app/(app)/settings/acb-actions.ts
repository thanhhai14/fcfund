"use server";

import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { acbEmailSettings, activityLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { emailHash } from "@/lib/acb-email-parser";

export async function saveAcbSettings(formData: FormData) {
  const actor = await requireUser();
  if (actor.role !== "ADMIN") throw new Error("Chỉ Admin được cấu hình tích hợp.");
  const parsed = z.object({ mode: z.enum(["OFF", "SIMULATE", "LIVE"]), mailbox: z.email().max(254), sender: z.email().max(254), subject: z.string().trim().min(1).max(500), accountPattern: z.string().trim().min(1).max(80) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Kiểm tra lại hộp thư, người gửi, tiêu đề và tài khoản nhận." };
  const rotate = formData.get("rotateKey") === "on";
  const revoke = formData.get("revokeKey") === "on";
  if (revoke && rotate) return { ok: false, message: "Chọn tạo lại hoặc thu hồi key." };
  const newKey = rotate ? `fcf_acb_${randomBytes(32).toString("hex")}` : null;
  const result = await db.transaction(async (tx) => {
    // Lock by club even when the settings row does not exist yet.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.clubId}))`);
    const [before] = await tx.select().from(acbEmailSettings).where(eq(acbEmailSettings.clubId, actor.clubId)).for("update");
    const keyHash = revoke ? null : newKey ? emailHash(newKey) : before?.keyHash ?? null;
    if (!revoke && parsed.data.mode !== "OFF" && !keyHash) return { ok: false, message: "Hãy chọn tạo API key trước khi bật tích hợp." };
    const mode = revoke ? "OFF" : parsed.data.mode;
    const values = { ...parsed.data, mailbox: parsed.data.mailbox.toLowerCase(), sender: parsed.data.sender.toLowerCase(), mode, keyHash, activatedAt: before?.activatedAt ?? (mode === "LIVE" ? new Date() : null), updatedAt: new Date() };
    await tx.insert(acbEmailSettings).values({ clubId: actor.clubId, ...values }).onConflictDoUpdate({ target: acbEmailSettings.clubId, set: values });
    await tx.insert(activityLogs).values({ clubId: actor.clubId, entityType: "acb_email_settings", entityId: actor.clubId, action: "UPDATE", actorId: actor.id, afterData: { mode, mailbox: values.mailbox, sender: values.sender, subject: values.subject, keyRotated: rotate, keyRevoked: revoke }, message: "Cập nhật tích hợp email ACB" });
    return { ok: true, message: newKey ? `Đã lưu. API key chỉ hiển thị lần này, hãy sao chép vào Script Properties: ${newKey}` : "Đã lưu cấu hình tích hợp ACB." };
  });
  revalidatePath("/settings");
  return result;
}
