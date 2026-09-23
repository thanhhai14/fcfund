import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function OpenNotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/notifications");
  const destination = `/notifications/${id}`;
  if (await getCurrentUser()) redirect(destination);
  redirect(`/login?next=${encodeURIComponent(destination)}`);
}
