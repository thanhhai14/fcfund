import "server-only";

import { compare, hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { members, users } from "@/db/schema";

const COOKIE_NAME = "fcfund_session";
const SESSION_DURATION = 60 * 60 * 24 * 14;

type SessionPayload = {
  sub: string;
  clubId: string;
  memberId?: string;
  role: "ADMIN" | "TREASURER" | "MEMBER";
};

function authSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET chưa được cấu hình.");
  }
  return new TextEncoder().encode(value ?? "development-only-secret-change-me-please");
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({
    clubId: payload.clubId,
    memberId: payload.memberId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(authSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (
      !payload.sub ||
      typeof payload.clubId !== "string" ||
      !["ADMIN", "TREASURER", "MEMBER"].includes(String(payload.role))
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      clubId: payload.clubId,
      memberId: typeof payload.memberId === "string" ? payload.memberId : undefined,
      role: payload.role as SessionPayload["role"],
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await readSession();
  if (!session) return null;

  const [user] = await db
    .select({
      id: users.id,
      clubId: users.clubId,
      memberId: users.memberId,
      phone: users.phoneNormalized,
      role: users.role,
      isActive: users.isActive,
      memberName: members.fullName,
    })
    .from(users)
    .leftJoin(members, eq(users.memberId, members.id))
    .where(and(eq(users.id, session.sub), eq(users.clubId, session.clubId)))
    .limit(1);

  if (!user?.isActive) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAnonymous() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
}
