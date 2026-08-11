import { get } from "@vercel/blob";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clubs, matches } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db.select({ blobUrl: clubs.logoUrl }).from(matches)
    .innerJoin(clubs, eq(matches.clubId, clubs.id))
    .where(and(eq(matches.publicLineupToken, token), eq(matches.publicLineupEnabled, true), isNull(matches.deletedAt)))
    .limit(1);
  if (!row?.blobUrl) return new Response("Not found", { status: 404 });

  try {
    const access = row.blobUrl.includes(".private.blob.vercel-storage.com") ? "private" : "public";
    const result = await get(row.blobUrl, { access, ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
    if (!result) return new Response("Not found", { status: 404 });
    if (result.statusCode === 304) return new Response(null, { status: 304, headers: { ETag: result.blob.etag } });
    return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType, "Content-Length": String(result.blob.size), "Cache-Control": "private, no-store", ETag: result.blob.etag, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Không thể tải ảnh", { status: 502 });
  }
}
