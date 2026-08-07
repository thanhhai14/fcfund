import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { avatars } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { memberId } = await params;
  const [avatar] = await db.select().from(avatars).where(and(eq(avatars.memberId, memberId), eq(avatars.clubId, user.clubId))).limit(1);
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
