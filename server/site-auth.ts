import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import bcrypt from "bcryptjs";

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
 * Serve como acesso mestre/recuperação — usado quando nenhum usuário é
 * informado no login (ex: se todos os admins nomeados forem perdidos).
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

export async function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyAdminPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSiteSessionToken(username: string = "master"): Promise<string> {
  return new SignJWT({ scope: "site-admin", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export type SiteSession = { isSiteAdmin: boolean; username: string | null };

export async function verifySiteSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.scope === "site-admin";
  } catch {
    return false;
  }
}

export async function getSiteSession(req: Request): Promise<SiteSession> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[SITE_SESSION_COOKIE];
  if (!token) return { isSiteAdmin: false, username: null };

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "site-admin") return { isSiteAdmin: false, username: null };
    return {
      isSiteAdmin: true,
      username: typeof payload.username === "string" ? payload.username : null,
    };
  } catch {
    return { isSiteAdmin: false, username: null };
  }
}

export async function hasValidSiteSession(req: Request): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[SITE_SESSION_COOKIE];
  if (!token) return false;
  return verifySiteSessionToken(token);
}

export const SITE_SESSION_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;

// --- Rate limiting de tentativas de login ---
// Proteção simples contra força bruta na senha do site. Guarda em memória do
// processo (suficiente para uma única instância; não é compartilhado entre
// múltiplas réplicas, mas resolve o caso de uso deste app).
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

type AttemptRecord = { count: number; firstAttemptAt: number };
const loginAttempts = new Map<string, AttemptRecord>();

function pruneExpired(now: number) {
  for (const [key, record] of loginAttempts) {
    if (now - record.firstAttemptAt > WINDOW_MS) {
      loginAttempts.delete(key);
    }
  }
}

export function getClientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Retorna null se o cliente ainda pode tentar logar, ou o número de
 * milissegundos restantes de bloqueio caso o limite tenha sido excedido.
 */
export function checkLoginRateLimit(key: string): number | null {
  const now = Date.now();
  pruneExpired(now);

  const record = loginAttempts.get(key);
  if (!record) return null;

  if (now - record.firstAttemptAt > WINDOW_MS) {
    loginAttempts.delete(key);
    return null;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return WINDOW_MS - (now - record.firstAttemptAt);
  }

  return null;
}

export function registerFailedLoginAttempt(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

export function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}
