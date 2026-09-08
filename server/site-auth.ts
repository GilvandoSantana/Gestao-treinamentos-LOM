import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { randomUUID, timingSafeEqual } from "crypto";
import type { Request } from "express";
import bcrypt from "bcryptjs";
import { isDesktopSessionRevoked } from "./db-desktop-sessions";

export const SITE_SESSION_COOKIE = "site_session";
// Guarda o token do administrador enquanto ele está "vendo como" um usuário.
// Existir este cookie é o próprio sinal de que há uma sessão de admin para
// voltar — não precisa consultar o banco para saber.
export const IMPERSONATION_BACKUP_COOKIE = "site_admin_backup";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas (uma jornada de trabalho)

// Token de longa duração pro programa de sincronização de pasta (Windows) -
// diferente do cookie do navegador: sem o mecanismo de "marcador" (que só
// faz sentido dentro de uma aba, guardado em memória no cliente) e com validade
// bem mais longa, já que o programa roda sozinho, sem ninguém pra logar de
// novo toda hora. 30 dias é um meio-termo: dá pra deixar o computador
// ligado o mes inteiro sem precisar reconectar, mas limita por quanto tempo
// um token perdido/roubado continuaria valendo (o token fica só na máquina
// da pessoa, mas não tem hoje um jeito de revogar um token específico antes
// do prazo — só trocar a senha do SESSION_SECRET do servidor, que derruba
// TODAS as sessões de uma vez).
const DESKTOP_SYNC_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

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
  // Comparação em tempo constante — evita que alguém descubra a senha
  // caractere a caractere medindo quanto tempo a resposta demora.
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Ainda gasta um tempo comparável ao de uma comparação real, em vez
    // de retornar na hora — reduz (não elimina) o vazamento de tamanho.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function hashAdminPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyAdminPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const SESSION_MARKER_HEADER = "x-session-marker";

/**
 * Gera um marcador aleatório vinculado à sessão. O cliente guarda esse valor
 * só em memória (variável do módulo no navegador), que se perde ao recarregar
 * a página ou fechá-la. Sem ele, o cookie sozinho continuaria valendo — é o
 * que fazia o site entrar direto ao dar F5 ou reabrir a aba.
 */
export function generateSessionMarker(): string {
  return randomUUID();
}

export async function createSiteSessionToken(
  username: string = "master",
  role: "admin" | "user" = "admin",
  adminId: string | null = null,
  marker: string | null = null
): Promise<string> {
  return new SignJWT({ scope: "site-admin", username, role, adminId, marker })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

// Token de curtíssima duração emitido depois que usuário+senha já foram
// conferidos com sucesso, mas ANTES de a sessão de verdade existir — só
// prova "esta pessoa já passou pela senha corretamente", pra o segundo
// passo (código do app autenticador) não poder ser tentado sem antes ter
// acertado a senha. Nunca vira cookie — fica só na resposta, e o cliente
// guarda em memória até enviar de volta com o código de 2FA.
const PENDING_2FA_TTL_SECONDS = 5 * 60; // 5 minutos — tempo de sobra pra digitar o código, curto o bastante pra não valer a pena tentar adivinhar

export async function createPending2FAToken(adminId: string): Promise<string> {
  return new SignJWT({ scope: "pending-2fa", adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_2FA_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Devolve o adminId se o token for válido e do escopo certo, ou null. */
export async function verifyPending2FAToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "pending-2fa" || typeof payload.adminId !== "string") return null;
    return payload.adminId;
  } catch {
    return null;
  }
}

export type SiteSession = {
  isSiteAdmin: boolean;
  username: string | null;
  role: "admin" | "user" | null;
  adminId: string | null;
};

export async function verifySiteSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.scope === "site-admin";
  } catch {
    return false;
  }
}

/**
 * Token de longa duração pro programa de sincronização de pasta local
 * (Windows). Mesma validação de usuário/senha do login do site, mas sem
 * cookie e sem o marcador de sessão de navegador — o programa guarda esse
 * token criptografado no próprio computador e manda como cabeçalho
 * `Authorization: Bearer <token>` em cada chamada, em vez de cookie.
 */
export async function createDesktopSyncToken(
  username: string,
  role: "admin" | "user",
  adminId: string | null,
  sessionId: string
): Promise<string> {
  return new SignJWT({ scope: "desktop-sync", username, role, adminId, sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DESKTOP_SYNC_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export type DesktopSyncSession = {
  username: string;
  role: "admin" | "user";
  adminId: string | null;
  /** Ausente em tokens emitidos antes desta sessão ser rastreada
   * individualmente (versões antigas do programa) — nesse caso, não dá
   * pra checar revogação, e o token continua valendo até expirar
   * naturalmente (30 dias). Um novo login já emite com sessionId. */
  sessionId: string | null;
};

/** Decodifica e valida um token do programa de sincronização. Devolve
 * `null` se o token não existir, estiver expirado, ou não for desse tipo
 * (por exemplo, se alguém tentar usar um cookie de navegador aqui).
 * NÃO confere revogação aqui (isso exigiria uma consulta ao banco em
 * toda chamada) — quem chama esta função decide se/quando checar
 * isDesktopSessionRevoked, normalmente uma vez por requisição em
 * getSiteSession. */
export async function verifyDesktopSyncToken(
  token: string
): Promise<DesktopSyncSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "desktop-sync") return null;
    if (typeof payload.username !== "string") return null;
    return {
      username: payload.username,
      role: payload.role === "user" ? "user" : "admin",
      adminId: typeof payload.adminId === "string" ? payload.adminId : null,
      sessionId: typeof payload.sessionId === "string" ? payload.sessionId : null,
    };
  } catch {
    return null;
  }
}

/** Lê o token do cabeçalho `Authorization: Bearer <token>`, se houver. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

const EMPTY_SESSION: SiteSession = {
  isSiteAdmin: false,
  username: null,
  role: null,
  adminId: null,
};

export async function getSiteSession(req: Request): Promise<SiteSession> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[SITE_SESSION_COOKIE];

  if (!token) {
    // Sem cookie de navegador — tenta o token do programa de sincronização
    // de pasta local, mandado como cabeçalho Authorization: Bearer.
    const bearerToken = getBearerToken(req);
    if (!bearerToken) return { ...EMPTY_SESSION };

    const desktopSession = await verifyDesktopSyncToken(bearerToken);
    if (!desktopSession) return { ...EMPTY_SESSION };

    // Só checa revogação se o token TEM um sessionId — tokens emitidos
    // antes desta funcionalidade existir não têm essa informação, e
    // continuam valendo até expirar sozinhos (30 dias), sem quebrar quem
    // já estava logado no programa quando isso foi lançado.
    if (desktopSession.sessionId) {
      const revoked = await isDesktopSessionRevoked(desktopSession.sessionId);
      if (revoked) return { ...EMPTY_SESSION };
    }

    return {
      isSiteAdmin: true,
      username: desktopSession.username,
      role: desktopSession.role,
      adminId: desktopSession.adminId,
    };
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "site-admin") return { ...EMPTY_SESSION };

    // O marcador precisa bater com o que o navegador enviou. Ele só existe em
    // memória no cliente, então some ao recarregar a página ou fechar a aba —
    // sem ele, o acesso cai mesmo que o cookie continue valendo.
    if (payload.marker) {
      const headerValue = req.headers[SESSION_MARKER_HEADER];
      const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
      if (provided !== payload.marker) return { ...EMPTY_SESSION };
    }

    return {
      isSiteAdmin: true,
      username: typeof payload.username === "string" ? payload.username : null,
      role: payload.role === "user" ? "user" : "admin",
      adminId: typeof payload.adminId === "string" ? payload.adminId : null,
    };
  } catch {
    return { ...EMPTY_SESSION };
  }
}

export async function hasValidSiteSession(req: Request): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[SITE_SESSION_COOKIE];
  if (!token) return false;
  return verifySiteSessionToken(token);
}

/** Lê um cookie bruto (sem validar) — usado para o cookie de retaguarda. */
export function getRawCookie(req: Request, name: string): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return cookies[name];
}

/**
 * Decodifica o token de retaguarda para restaurar a sessão do administrador
 * ao encerrar o "ver como". Verifica a assinatura antes de confiar nele.
 */
export async function verifyBackupToken(
  token: string
): Promise<{ username: string; marker: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "site-admin") return null;
    return {
      username: typeof payload.username === "string" ? payload.username : "master",
      marker: typeof payload.marker === "string" ? payload.marker : null,
    };
  } catch {
    return null;
  }
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
  for (const [key, record] of Array.from(loginAttempts.entries())) {
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

// Mesmo padrão do limitador de login acima, só que pro cadastro público
// de organização nova — ação bem mais rara no uso normal (ninguém
// cadastra a mesma empresa repetidas vezes), então o limite é mais
// apertado. Protege contra alguém tentando criar várias organizações
// falsas em sequência.
const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const SIGNUP_MAX_ATTEMPTS = 3;
const signupAttempts = new Map<string, AttemptRecord>();

function pruneExpiredSignups(now: number) {
  for (const [key, record] of Array.from(signupAttempts.entries())) {
    if (now - record.firstAttemptAt > SIGNUP_WINDOW_MS) {
      signupAttempts.delete(key);
    }
  }
}

/** Mesma semântica de checkLoginRateLimit: null = pode tentar, número =
 * milissegundos restantes de bloqueio. */
export function checkSignupRateLimit(key: string): number | null {
  const now = Date.now();
  pruneExpiredSignups(now);

  const record = signupAttempts.get(key);
  if (!record) return null;

  if (now - record.firstAttemptAt > SIGNUP_WINDOW_MS) {
    signupAttempts.delete(key);
    return null;
  }

  if (record.count >= SIGNUP_MAX_ATTEMPTS) {
    return SIGNUP_WINDOW_MS - (now - record.firstAttemptAt);
  }

  return null;
}

export function registerSignupAttempt(key: string): void {
  const now = Date.now();
  const record = signupAttempts.get(key);
  if (!record || now - record.firstAttemptAt > SIGNUP_WINDOW_MS) {
    signupAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

// Portal de autoatendimento do colaborador — identificação por CPF + PIN
// (bem mais fraca que usuário/senha de administrador, já que o CPF não é
// segredo e o PIN é curto). Por isso um cookie PRÓPRIO, separado do
// site_session do administrador (nunca colidem nem interferem um no
// outro), sessão mais curta, e um limite de tentativas bem mais
// apertado — tanto por IP quanto por CPF específico (alguém tentando
// advinhar o PIN de UMA pessoa, de vários IPs diferentes, também é
// barrado).

export const EMPLOYEE_SESSION_COOKIE = "employee_session";
const EMPLOYEE_SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 horas — sessão mais curta que a de admin, de propósito

export async function createEmployeeSessionToken(employeeId: string, contractSlug: string): Promise<string> {
  return new SignJWT({ scope: "employee-portal", employeeId, contractSlug })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EMPLOYEE_SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyEmployeeSessionToken(
  token: string
): Promise<{ employeeId: string; contractSlug: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.scope !== "employee-portal" || typeof payload.employeeId !== "string") return null;
    return { employeeId: payload.employeeId, contractSlug: String(payload.contractSlug ?? "") };
  } catch {
    return null;
  }
}

const PORTAL_WINDOW_MS = 30 * 60 * 1000; // 30 minutos
const PORTAL_MAX_ATTEMPTS = 5;
const portalAttemptsByIp = new Map<string, AttemptRecord>();
const portalAttemptsByCpf = new Map<string, AttemptRecord>();

function checkPortalLimit(map: Map<string, AttemptRecord>, key: string): number | null {
  const now = Date.now();
  const record = map.get(key);
  if (!record) return null;
  if (now - record.firstAttemptAt > PORTAL_WINDOW_MS) {
    map.delete(key);
    return null;
  }
  if (record.count >= PORTAL_MAX_ATTEMPTS) {
    return PORTAL_WINDOW_MS - (now - record.firstAttemptAt);
  }
  return null;
}

function registerPortalAttempt(map: Map<string, AttemptRecord>, key: string): void {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now - record.firstAttemptAt > PORTAL_WINDOW_MS) {
    map.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

/** Confere os dois limites (por IP e pelo CPF específico tentado) — o
 * mais restritivo dos dois decide. null = pode tentar. */
export function checkEmployeePortalRateLimit(ip: string, cpf: string): number | null {
  const byIp = checkPortalLimit(portalAttemptsByIp, ip);
  const byCpf = checkPortalLimit(portalAttemptsByCpf, cpf);
  if (byIp === null && byCpf === null) return null;
  return Math.max(byIp ?? 0, byCpf ?? 0);
}

export function registerEmployeePortalAttempt(ip: string, cpf: string): void {
  registerPortalAttempt(portalAttemptsByIp, ip);
  registerPortalAttempt(portalAttemptsByCpf, cpf);
}

export function clearEmployeePortalAttempts(ip: string, cpf: string): void {
  portalAttemptsByIp.delete(ip);
  portalAttemptsByCpf.delete(cpf);
}

export async function hashEmployeePin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyEmployeePin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
