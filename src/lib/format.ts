import { APP_TIMEZONE } from "./constants";

export function formatMoney(value: number | bigint) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function dateValue(value: string | Date) {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
}

export function formatDate(value: string | Date, timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dateValue(value));
}

export function formatTime(value: string | Date, timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dateValue(value));
}

export function formatDateTime(value: string | Date, timezone = APP_TIMEZONE) {
  return `${formatDate(value, timezone)} · ${formatTime(value, timezone)}`;
}

export function formatLongDate(value: string | Date = new Date(), timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    dateStyle: "full",
  }).format(dateValue(value));
}

export function todayInTimezone(timezone = APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function monthStart(value = todayInTimezone()) {
  return `${value.slice(0, 7)}-01`;
}

export function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
