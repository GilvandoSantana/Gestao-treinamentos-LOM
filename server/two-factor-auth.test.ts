import { describe, it, expect } from 'vitest';
import { generate } from 'otplib';
import {
  generateTwoFactorSecret,
  buildTwoFactorURI,
  verifyTwoFactorCode,
  generateBackupCodes,
  hashBackupCodes,
  verifyAndConsumeBackupCode,
} from './two-factor-auth';

describe('TOTP (código do aplicativo autenticador)', () => {
  it('gera um segredo que dá pra usar de verdade num código válido', async () => {
    const secret = generateTwoFactorSecret();
    const code = await generate({ secret });
    const isValid = await verifyTwoFactorCode(secret, code);
    expect(isValid).toBe(true);
  });

  it('rejeita um código errado', async () => {
    const secret = generateTwoFactorSecret();
    const isValid = await verifyTwoFactorCode(secret, '000000');
    expect(isValid).toBe(false);
  });

  it('rejeita um código de outro segredo (não é intercambiável entre contas)', async () => {
    const secretA = generateTwoFactorSecret();
    const secretB = generateTwoFactorSecret();
    const codeForA = await generate({ secret: secretA });
    const isValid = await verifyTwoFactorCode(secretB, codeForA);
    expect(isValid).toBe(false);
  });

  it('não quebra com entrada maluca (letras, vazio) — trata como inválido', async () => {
    const secret = generateTwoFactorSecret();
    expect(await verifyTwoFactorCode(secret, 'abc')).toBe(false);
    expect(await verifyTwoFactorCode(secret, '')).toBe(false);
  });

  it('monta uma URI de QR code reconhecível (com o nome do produto e do usuário)', () => {
    const secret = generateTwoFactorSecret();
    const uri = buildTwoFactorURI(secret, 'joao.silva');
    expect(uri).toContain('otpauth://');
    expect(uri).toContain('GesCon');
    expect(uri).toContain('joao.silva');
  });
});

describe('Códigos de backup', () => {
  it('gera a quantidade certa, no formato XXXXX-XXXXX', () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/);
    }
  });

  it('gera códigos diferentes entre si', () => {
    const codes = generateBackupCodes(8);
    expect(new Set(codes).size).toBe(8);
  });

  it('confirma um código válido e o remove da lista (não serve duas vezes)', async () => {
    const codes = generateBackupCodes(3);
    const hashedJson = await hashBackupCodes(codes);

    const firstUse = await verifyAndConsumeBackupCode(hashedJson, codes[0]);
    expect(firstUse.valid).toBe(true);

    const secondUse = await verifyAndConsumeBackupCode(firstUse.remainingCodesJson, codes[0]);
    expect(secondUse.valid).toBe(false);
  });

  it('aceita o código digitado sem o hífen ou em minúscula', async () => {
    const codes = generateBackupCodes(1);
    const hashedJson = await hashBackupCodes(codes);
    const semHifenMinusculo = codes[0].replace('-', '').toLowerCase();

    const result = await verifyAndConsumeBackupCode(hashedJson, semHifenMinusculo);
    expect(result.valid).toBe(true);
  });

  it('rejeita um código que nunca existiu', async () => {
    const codes = generateBackupCodes(2);
    const hashedJson = await hashBackupCodes(codes);
    const result = await verifyAndConsumeBackupCode(hashedJson, 'AAAAA-BBBBB');
    expect(result.valid).toBe(false);
  });

  it('lida com lista vazia/nula sem quebrar', async () => {
    expect((await verifyAndConsumeBackupCode(null, 'AAAAA-BBBBB')).valid).toBe(false);
    expect((await verifyAndConsumeBackupCode('[]', 'AAAAA-BBBBB')).valid).toBe(false);
  });
});
