"use client";

import { useEffect } from "react";
import { markNotificationRead } from "../actions";

export function MarkReminderRead({ eventId }: { eventId: string | null }) {
  useEffect(() => { if (eventId) void markNotificationRead(eventId); }, [eventId]);
  return null;
}
