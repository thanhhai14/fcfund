import "server-only";

const VIETQR_BANKS_URL = "https://api.vietqr.io/v2/banks";
const VIETQR_ANDROID_APPS_URL = "https://api.vietqr.io/v2/android-app-deeplinks";
const VIETQR_IOS_APPS_URL = "https://api.vietqr.io/v2/ios-app-deeplinks";
const VIETQR_PAY_URL = "https://dl.vietqr.io/pay";
const VIETQR_IMAGE_URL = "https://img.vietqr.io/image";
export const VIETQR_QR_TEMPLATE = "LAZD3qS";
const CACHE_SECONDS = 24 * 60 * 60;

export type VietQrBank = {
  id: number;
  name: string;
  code: string;
  bin: string;
  shortName: string;
  logo: string | null;
  transferSupported: boolean;
  lookupSupported: boolean;
};

export type VietQrBankApp = {
  appId: string;
  appLogo: string | null;
  appName: string;
  bankName: string;
  monthlyInstall: number;
  deeplink: string;
  autofillSupported: boolean;
};

const AUTOFILL_APP_IDS = new Set(["mb", "icb", "bidv", "acb", "ocb"]);
const TRANSFER_NOTE_MAX_LENGTH = 40;

type VietQrBanksResponse = {
  code?: string;
  data?: Array<{
    id?: number;
    name?: string;
    code?: string;
    bin?: string | number;
    shortName?: string;
    logo?: string;
    transferSupported?: number | boolean;
    lookupSupported?: number | boolean;
  }>;
};

type VietQrAppsResponse = {
  apps?: Array<{
    appId?: string;
    appLogo?: string;
    appName?: string;
    bankName?: string;
    monthlyInstall?: number;
    deeplink?: string;
  }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`VietQR request failed (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export async function getVietQrBanks(): Promise<VietQrBank[]> {
  const payload = await fetchJson<VietQrBanksResponse>(VIETQR_BANKS_URL);
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows
    .map((row): VietQrBank | null => {
      const code = row.code?.trim().toUpperCase() ?? "";
      const bin = String(row.bin ?? "").trim();
      const name = row.name?.trim() ?? "";
      const shortName = row.shortName?.trim() ?? code;
      if (!row.id || !code || !/^\d{6}$/.test(bin) || !name) return null;

      return {
        id: row.id,
        name,
        code,
        bin,
        shortName,
        logo: row.logo?.trim() || null,
        transferSupported: row.transferSupported === true || row.transferSupported === 1,
        lookupSupported: row.lookupSupported === true || row.lookupSupported === 1,
      };
    })
    .filter((row): row is VietQrBank => Boolean(row))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "vi"));
}

export async function findVietQrBank(code: string): Promise<VietQrBank | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const banks = await getVietQrBanks();
  return banks.find((bank) => bank.code === normalized) ?? null;
}

export async function getVietQrBankApps(platform: "android" | "ios"): Promise<VietQrBankApp[]> {
  const payload = await fetchJson<VietQrAppsResponse>(
    platform === "ios" ? VIETQR_IOS_APPS_URL : VIETQR_ANDROID_APPS_URL,
  );
  const rows = Array.isArray(payload.apps) ? payload.apps : [];

  const seen = new Set<string>();
  return rows
    .map((row): VietQrBankApp | null => {
      const appId = row.appId?.trim().toLowerCase() ?? "";
      const appName = row.appName?.trim() ?? "";
      const bankName = row.bankName?.trim() ?? "";
      const deeplink = row.deeplink?.trim() ?? "";
      if (!appId || !appName || !bankName || !deeplink || seen.has(appId)) return null;

      let parsed: URL;
      try {
        parsed = new URL(deeplink);
      } catch {
        return null;
      }
      if (parsed.protocol !== "https:" || parsed.hostname !== "dl.vietqr.io") return null;

      seen.add(appId);
      return {
        appId,
        appLogo: row.appLogo?.trim() || null,
        appName,
        bankName,
        monthlyInstall: Number.isFinite(row.monthlyInstall) ? Number(row.monthlyInstall) : 0,
        deeplink,
        autofillSupported: AUTOFILL_APP_IDS.has(appId),
      };
    })
    .filter((row): row is VietQrBankApp => Boolean(row))
    .sort((a, b) =>
      Number(b.autofillSupported) - Number(a.autofillSupported)
      || b.monthlyInstall - a.monthlyInstall
      || a.appName.localeCompare(b.appName, "vi")
    );
}

export function detectBankAppPlatform(userAgent: string): "android" | "ios" | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent) || /Macintosh.*Mobile/i.test(userAgent)) return "ios";
  return null;
}

function normalizeBankText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/đ/g, "d")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fitTransferSegments(clubName: string, memberName: string, date: string) {
  let club = normalizeBankText(clubName);
  let member = normalizeBankText(memberName);
  const suffix = normalizeBankText(date);
  if (!club || !member || !suffix) throw new Error("Nội dung chuyển khoản không hợp lệ.");

  const compose = () => [club, member, suffix].join(" ").replace(/\s+/g, " ").trim();
  while (compose().length > TRANSFER_NOTE_MAX_LENGTH) {
    if (member.length >= club.length && member.length > 4) {
      member = member.slice(0, -1).trimEnd();
      continue;
    }
    if (club.length > 4) {
      club = club.slice(0, -1).trimEnd();
      continue;
    }
    break;
  }

  return compose().slice(0, TRANSFER_NOTE_MAX_LENGTH).trim();
}

export function buildDebtTransferContent(input: {
  clubName: string;
  memberName: string;
  paymentDate: string;
}) {
  const [year, month, day] = input.paymentDate.split("-");
  if (!year || !month || !day) {
    throw new Error("Ngày thanh toán không hợp lệ.");
  }

  return fitTransferSegments(input.clubName, input.memberName, `${day}${month}${year}`);
}

export function buildVietQrQuickLink(input: {
  bankBin: string;
  bankAccountNumber: string;
  amount: number;
  transferContent: string;
  bankAccountHolder: string;
  template?: string;
}) {
  if (!/^\d{6}$/.test(input.bankBin.trim())) {
    throw new Error("BIN ngân hàng không hợp lệ.");
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Số tiền thanh toán không hợp lệ.");
  }

  const account = input.bankAccountNumber.replace(/\s+/g, "").trim();
  const holder = normalizeBankText(input.bankAccountHolder).toUpperCase().slice(0, 50).trim();
  const transferContent = normalizeBankText(input.transferContent)
    .slice(0, TRANSFER_NOTE_MAX_LENGTH)
    .trim();
  const template = (input.template ?? VIETQR_QR_TEMPLATE).trim();

  if (!account || account.length > 19 || !holder || !transferContent || !template) {
    throw new Error("Thiếu thông tin tạo VietQR.");
  }

  const url = new URL(
    `${VIETQR_IMAGE_URL}/${encodeURIComponent(input.bankBin.trim())}-${encodeURIComponent(account)}-${encodeURIComponent(template)}.png`,
  );
  url.searchParams.set("amount", String(input.amount));
  url.searchParams.set("addInfo", transferContent);
  url.searchParams.set("accountName", holder);
  return url.toString();
}

export function buildVietQrPaymentUrl(input: {
  appId: string;
  bankCode: string;
  bankAccountNumber: string;
  amount: number;
  transferContent: string;
  bankAccountHolder: string;
  returnUrl: string;
}) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Số tiền thanh toán không hợp lệ.");
  }

  const appId = input.appId.trim().toLowerCase();
  const bankCode = input.bankCode.trim().toLowerCase();
  const account = input.bankAccountNumber.replace(/\s+/g, "").trim();
  const holder = normalizeBankText(input.bankAccountHolder).toUpperCase().slice(0, 50).trim();
  const transferContent = normalizeBankText(input.transferContent)
    .slice(0, TRANSFER_NOTE_MAX_LENGTH)
    .trim();

  if (!appId || !bankCode || !account || !holder || !transferContent) {
    throw new Error("Thiếu thông tin thanh toán.");
  }

  const returnUrl = new URL(input.returnUrl);
  if (!["http:", "https:"].includes(returnUrl.protocol)) {
    throw new Error("Return URL không hợp lệ.");
  }

  const url = new URL(VIETQR_PAY_URL);
  url.searchParams.set("app", appId);
  url.searchParams.set("ba", `${account}@${bankCode}`);
  url.searchParams.set("am", String(input.amount));
  url.searchParams.set("tn", transferContent);
  url.searchParams.set("bn", holder);
  url.searchParams.set("url", returnUrl.toString());
  return url.toString();
}
