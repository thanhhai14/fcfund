import { get } from "@vercel/blob";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { avatars, matches, matchTeamMembers, matchTeamVersions } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string; memberId: string }> }) {
  const { token, memberId } = await params;
  const [avatar] = await db.select({ blobUrl: avatars.blobUrl }).from(matches)
    .innerJoin(matchTeamVersions, and(eq(matchTeamVersions.matchId, matches.id), eq(matchTeamVersions.status, "CONFIRMED")))
    .innerJoin(matchTeamMembers, and(eq(matchTeamMembers.versionId, matchTeamVersions.id), eq(matchTeamMembers.memberId, memberId)))
    .innerJoin(avatars, and(eq(avatars.memberId, memberId), eq(avatars.clubId, matches.clubId)))
    .where(and(eq(matches.publicLineupToken, token), eq(matches.publicLineupEnabled, true), isNull(matches.deletedAt)))
    .limit(1);
  if (!avatar) return new Response("Not found", { status: 404 });

  try {
    const access = avatar.blobUrl.includes(".private.blob.vercel-storage.com") ? "private" : "public";
    const result = await get(avatar.blobUrl, { access, ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
    if (!result) return new Response("Not found", { status: 404 });
    if (result.statusCode === 304) return new Response(null, { status: 304, headers: { ETag: result.blob.etag } });
    return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType, "Content-Length": String(result.blob.size), "Cache-Control": "private, no-store", ETag: result.blob.etag, "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Không thể tải ảnh", { status: 502 });
  }
}
