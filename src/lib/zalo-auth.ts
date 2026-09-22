import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

const ZALO_AUTHORIZE_URL = "https://oauth.zaloapp.com/v4/permission";
const ZALO_TOKEN_URL = "https://oauth.zaloapp.com/v4/access_token";
const ZALO_PROFILE_URL = "https://graph.zalo.me/v2.0/me";
const PKCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export const ZALO_OAUTH_STATE_COOKIE = "zalo_oauth_state";
export const ZALO_OAUTH_VERIFIER_COOKIE = "zalo_pkce_verifier";
export const ZALO_OAUTH_DEBUG_COOKIE = "zalo_oauth_debug";
export const ZALO_OAUTH_COOKIE_MAX_AGE = 10 * 60;

type ZaloTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string;
  error?: number | string;
  error_name?: string;
};

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

export function isZaloAccessTokenDebugEnabled() {
  return process.env.ZALO_DEBUG_SHOW_ACCESS_TOKEN === "true";
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
    const errorCode = data?.error ?? response.status;
    throw new Error(`Không đổi được authorization code sang Zalo access token (code: ${errorCode}).`);
  }

  return accessToken;
}

export async function fetchZaloProfile(accessToken: string): Promise<ZaloProfile> {
  const response = await fetch(ZALO_PROFILE_URL, {
    headers: {
      access_token: accessToken,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json().catch(() => null) as {
    id?: string;
    name?: string;
    picture?: { data?: { url?: string } };
    error?: number | string;
  } | null;

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
