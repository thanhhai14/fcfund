import { get } from "@vercel/blob";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { avatars, members, users } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const [avatar] = await db.select({ blobUrl: avatars.blobUrl }).from(members)
    .leftJoin(users, eq(users.memberId, members.id))
    .innerJoin(avatars, or(eq(avatars.memberId, members.id), eq(avatars.userId, users.id)))
    .where(and(eq(members.id, memberId), eq(members.status, "ACTIVE")))
    .limit(1);
  if (!avatar?.blobUrl) return new Response("Not found", { status: 404 });

  try {
    const access = avatar.blobUrl.includes(".private.blob.vercel-storage.com") ? "private" : "public";
    const result = await get(avatar.blobUrl, { access, ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
    if (!result) return new Response("Not found", { status: 404 });
    if (result.statusCode === 304) return new Response(null, { status: 304, headers: { ETag: result.blob.etag } });
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Content-Length": String(result.blob.size),
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600, must-revalidate",
        ETag: result.blob.etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Không thể tải ảnh", { status: 502 });
  }
}
