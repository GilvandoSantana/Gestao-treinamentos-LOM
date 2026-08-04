import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";

export const SITE_SESSION_COOKIE = "site_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET não configurado (ou muito curto). Defina uma variável de ambiente SESSION_SECRET com pelo menos 16 caracteres."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Verifica a senha de acesso do site contra a variável de ambiente APP_PASSWORD.
 * A senha NUNCA deve ficar hardcoded no client.
 */
export function checkSitePassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error(
      "APP_PASSWORD não configurado no servidor. Defina essa variável de ambiente no Railway."
    );
  }
  return password === expected;
}

export async function createSiteSessionToken(): Promise<string> {
  return new SignJWT({ scope: "site-admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySiteSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.scope === "site-admin";
  } catch {
    return false;
  }
}

export async function hasValidSiteSession(req: Request): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[SITE_SESSION_COOKIE];
  if (!token) return false;
  return verifySiteSessionToken(token);
}

export const SITE_SESSION_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;
