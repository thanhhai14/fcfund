import { get } from "@vercel/blob";
import { db } from "@/db";
import { clubs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const [club] = await db.select({ blobUrl: clubs.logoUrl }).from(clubs).limit(1);
  if (!club?.blobUrl) return new Response("Not found", { status: 404 });

  try {
    const access = club.blobUrl.includes(".private.blob.vercel-storage.com") ? "private" : "public";
    const result = await get(club.blobUrl, { access, ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
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
