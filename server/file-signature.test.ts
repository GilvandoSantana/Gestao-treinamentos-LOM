import { describe, it, expect } from 'vitest';
import { detectDangerousFileSignature } from './file-signature';

describe('detectDangerousFileSignature', () => {
  it('detecta um executável do Windows (MZ) mesmo que a extensão diga outra coisa', () => {
    // "MZ" é a assinatura pública e bem documentada de todo .exe/.dll do
    // Windows - não é um vírus, só o cabeçalho do formato do arquivo.
    const buf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    expect(detectDangerousFileSignature(buf)).toContain('Windows');
  });

  it('detecta um executável ELF do Linux', () => {
    const buf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
    expect(detectDangerousFileSignature(buf)).toContain('Linux');
  });

  it('detecta um script com shebang (#!)', () => {
    const buf = Buffer.from('#!/bin/bash\necho oi\n', 'utf-8');
    expect(detectDangerousFileSignature(buf)).toContain('script');
  });

  it('não acusa nada num PDF de verdade', () => {
    const buf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj', 'utf-8');
    expect(detectDangerousFileSignature(buf)).toBeNull();
  });

  it('não acusa nada num DOCX/XLSX/ZIP de verdade (assinatura PK)', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(detectDangerousFileSignature(buf)).toBeNull();
  });

  it('não acusa nada numa imagem PNG de verdade', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectDangerousFileSignature(buf)).toBeNull();
  });

  it('não quebra com um buffer bem pequeno (menor que qualquer assinatura)', () => {
    expect(detectDangerousFileSignature(Buffer.from([0x01]))).toBeNull();
    expect(detectDangerousFileSignature(Buffer.alloc(0))).toBeNull();
  });
});
