import { get } from "@vercel/blob";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { avatars, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return new Response("Unauthorized", { status: 401 });
  const { userId } = await params;
  const [avatar] = await db.select({
    blobUrl: avatars.blobUrl,
  }).from(users)
    .innerJoin(avatars, or(eq(avatars.userId, users.id), eq(avatars.memberId, users.memberId)))
    .where(and(eq(users.id, userId), eq(users.clubId, currentUser.clubId), eq(avatars.clubId, currentUser.clubId)))
    .limit(1);
  if (!avatar) return new Response("Not found", { status: 404 });

  try {
    const result = await get(avatar.blobUrl, { access: "private", ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
    if (!result) return new Response("Not found", { status: 404 });
    if (result.statusCode === 304) return new Response(null, { status: 304, headers: { ETag: result.blob.etag } });
    return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType, "Content-Length": String(result.blob.size), "Cache-Control": "private, max-age=3600, must-revalidate", ETag: result.blob.etag, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Không thể tải ảnh", { status: 502 });
  }
}
