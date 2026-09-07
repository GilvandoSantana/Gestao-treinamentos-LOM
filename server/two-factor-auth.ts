/**
 * Autenticação em duas etapas (2FA) — TOTP, compatível com Google
 * Authenticator, Authy, e qualquer app que siga o padrão RFC 6238.
 *
 * Fluxo de configuração (ver server/routers/auth.ts):
 * 1. generateTwoFactorSecret() + buildTwoFactorURI() — mostra o QR code
 *    pra pessoa escanear. O segredo NÃO é salvo no banco ainda.
 * 2. Pessoa digita o código de 6 dígitos que o app gerou.
 *    verifyTwoFactorCode() confirma que bateu — só ENTÃO o segredo é
 *    salvo de verdade (evita ativar 2FA com um segredo que a pessoa
 *    nunca confirmou ter escaneado direito).
 * 3. generateBackupCodes() + hashBackupCodes() — mostrados uma única vez
 *    pra pessoa guardar, caso perca acesso ao aplicativo autenticador.
 */

import { generateSecret, verify, generateURI } from "otplib";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

export function generateTwoFactorSecret(): string {
  return generateSecret();
}

export function buildTwoFactorURI(secret: string, username: string): string {
  return generateURI({ issuer: "GesCon", label: username, secret });
}

export async function verifyTwoFactorCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: code.trim() });
    return result.valid;
  } catch {
    // Código mal formado (não numérico, tamanho errado) — trata como
    // inválido, não como erro.
    return false;
  }
}

/** Normaliza um código de backup pro mesmo formato antes de comparar —
 * assim a pessoa pode digitar com ou sem o hífen, maiúscula ou
 * minúscula, que o resultado é o mesmo. */
function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Gera códigos reserva no formato XXXXX-XXXXX (fácil de ler e digitar). */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 caracteres hex
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Guarda o HASH de cada código (nunca o texto puro) — mesmo cuidado de
 * senha normal. Salva a versão normalizada, pra bater com
 * normalizeBackupCode() na hora de conferir. */
export async function hashBackupCodes(codes: string[]): Promise<string> {
  const hashed = await Promise.all(codes.map((c) => bcrypt.hash(normalizeBackupCode(c), 10)));
  return JSON.stringify(hashed);
}

/**
 * Confere um código de backup contra a lista salva. Se bater, devolve a
 * lista SEM esse código (cada um só serve uma vez) — quem chama precisa
 * salvar essa lista nova de volta no banco.
 */
export async function verifyAndConsumeBackupCode(
  hashedCodesJson: string | null,
  code: string
): Promise<{ valid: boolean; remainingCodesJson: string }> {
  if (!hashedCodesJson) return { valid: false, remainingCodesJson: hashedCodesJson ?? "[]" };

  let hashedCodes: string[];
  try {
    hashedCodes = JSON.parse(hashedCodesJson);
  } catch {
    return { valid: false, remainingCodesJson: hashedCodesJson };
  }

  const normalized = normalizeBackupCode(code);
  for (let i = 0; i < hashedCodes.length; i++) {
    const matches = await bcrypt.compare(normalized, hashedCodes[i]);
    if (matches) {
      const remaining = [...hashedCodes];
      remaining.splice(i, 1);
      return { valid: true, remainingCodesJson: JSON.stringify(remaining) };
    }
  }
  return { valid: false, remainingCodesJson: hashedCodesJson };
}
