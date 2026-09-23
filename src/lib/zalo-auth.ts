import "server-only";

import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

const ZALO_AUTHORIZE_URL = "https://oauth.zaloapp.com/v4/permission";
const ZALO_TOKEN_URL = "https://oauth.zaloapp.com/v4/access_token";
const ZALO_PROFILE_URL = "https://graph.zalo.me/v2.0/me";
const PKCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const ZALO_OAUTH_STATE_COOKIE = "zalo_oauth_state";
export const ZALO_OAUTH_VERIFIER_COOKIE = "zalo_pkce_verifier";
export const ZALO_OAUTH_COOKIE_MAX_AGE = 10 * 60;

type ZaloTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string;
  error?: number | string;
  error_name?: string;
};

export class ZaloTokenExchangeError extends Error {
  code: number | string;
  errorName: string | null;
  httpStatus: number;

  constructor(input: {
    code: number | string;
    errorName?: string | null;
    httpStatus: number;
  }) {
    super(`Không đổi được authorization code sang Zalo access token (code: ${input.code}).`);
    this.name = "ZaloTokenExchangeError";
    this.code = input.code;
    this.errorName = input.errorName?.trim() || null;
    this.httpStatus = input.httpStatus;
  }
}

export type ZaloProfile = {
  id: string;
  name: string;
  pictureUrl: string | null;
};

function requiredEnv(name: "ZALO_APP_ID" | "ZALO_APP_SECRET" | "ZALO_REDIRECT_URI") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} chưa được cấu hình.`);
  return value;
}

export function isZaloLoginEnabled() {
  return process.env.ZALO_LOGIN_ENABLED === "true";
}

export function getZaloConfig() {
  return {
    appId: requiredEnv("ZALO_APP_ID"),
    appSecret: requiredEnv("ZALO_APP_SECRET"),
    redirectUri: requiredEnv("ZALO_REDIRECT_URI"),
  };
}

export function createZaloOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function createZaloCodeVerifier() {
  let verifier = "";
  for (let index = 0; index < 43; index += 1) {
    verifier += PKCE_ALPHABET[randomInt(PKCE_ALPHABET.length)];
  }
  return verifier;
}

export function createZaloCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function buildZaloAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL(ZALO_AUTHORIZE_URL);
  url.searchParams.set("app_id", input.appId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("state", input.state);
  return url;
}

export async function exchangeZaloCode(input: {
  code: string;
  codeVerifier: string;
  appId: string;
  appSecret: string;
}) {
  const response = await fetch(ZALO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: input.appSecret,
    },
    body: new URLSearchParams({
      code: input.code,
      app_id: input.appId,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json().catch(() => null) as ZaloTokenResponse | null;
  const accessToken = data?.access_token?.trim();

  if (!response.ok || !accessToken) {
    throw new ZaloTokenExchangeError({
      code: data?.error ?? response.status,
      errorName: data?.error_name,
      httpStatus: response.status,
    });
  }

  return accessToken;
}

type ZaloGraphProfileResponse = {
  id?: string;
  name?: string;
  picture?: { data?: { url?: string } };
  error?: number | string;
  message?: string;
};

type ZaloProxyProfileResponse = {
  id?: string;
  name?: string;
  pictureUrl?: string | null;
  error?: string;
  code?: number | string;
  message?: string;
};

function getZaloProfileProxyConfig() {
  const url = process.env.ZALO_PROFILE_PROXY_URL?.trim() ?? "";
  const secret = process.env.ZALO_PROFILE_PROXY_SECRET?.trim() ?? "";

  if (!url && !secret) return null;
  if (!url || !secret) {
    throw new Error("ZALO_PROFILE_PROXY_URL và ZALO_PROFILE_PROXY_SECRET phải được cấu hình cùng nhau.");
  }

  const parsedUrl = new URL(url);
  if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new Error("ZALO_PROFILE_PROXY_URL phải dùng HTTPS trên production.");
  }

  if (secret.length < 32) {
    throw new Error("ZALO_PROFILE_PROXY_SECRET phải có ít nhất 32 ký tự.");
  }

  return { url, secret };
}

async function fetchZaloProfileDirect(accessToken: string): Promise<ZaloProfile> {
  const response = await fetch(ZALO_PROFILE_URL, {
    headers: {
      access_token: accessToken,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json().catch(() => null) as ZaloGraphProfileResponse | null;
  const id = data?.id?.trim();
  const name = data?.name?.trim();

  if (!response.ok || !id || !name) {
    const errorCode = data?.error ?? response.status;
    throw new Error(`Không lấy được Zalo profile (code: ${errorCode}).`);
  }

  return {
    id,
    name,
    pictureUrl: data?.picture?.data?.url?.trim() || null,
  };
}

async function fetchZaloProfileViaProxy(
  accessToken: string,
  proxy: { url: string; secret: string },
): Promise<ZaloProfile> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ accessToken });
  const signature = createHmac("sha256", proxy.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  const response = await fetch(proxy.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FCFUND-Timestamp": timestamp,
      "X-FCFUND-Signature": signature,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const data = await response.json().catch(() => null) as ZaloProxyProfileResponse | null;
  const id = data?.id?.trim();
  const name = data?.name?.trim();

  if (!response.ok || !id || !name) {
    const errorCode = data?.code ?? data?.error ?? response.status;
    const detail = data?.message?.trim();
    throw new Error(
      detail
        ? `Không lấy được Zalo profile qua proxy (code: ${errorCode}): ${detail}`
        : `Không lấy được Zalo profile qua proxy (code: ${errorCode}).`,
    );
  }

  return {
    id,
    name,
    pictureUrl: data?.pictureUrl?.trim() || null,
  };
}

export async function fetchZaloProfile(accessToken: string): Promise<ZaloProfile> {
  const proxy = getZaloProfileProxyConfig();
  if (proxy) {
    return fetchZaloProfileViaProxy(accessToken, proxy);
  }

  return fetchZaloProfileDirect(accessToken);
}
