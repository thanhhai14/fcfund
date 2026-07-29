"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { normalizePhone } from "@/lib/format";

export type LoginState = { error?: string };

const loginSchema = z.object({
  phone: z.string().min(8).max(15).regex(/^\d+$/),
  password: z.string().min(6).max(100),
});

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    phone: normalizePhone(String(formData.get("phone") ?? "")),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { error: "Số điện thoại hoặc mật khẩu không hợp lệ." };

  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.phoneNormalized, parsed.data.phone),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Số điện thoại hoặc mật khẩu không đúng." };
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession({
    sub: user.id,
    clubId: user.clubId,
    memberId: user.memberId ?? undefined,
    role: user.role,
  });
  redirect("/dashboard");
}
