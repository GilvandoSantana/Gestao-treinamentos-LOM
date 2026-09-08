import { describe, it, expect } from 'vitest';
import { extractStoragePath } from './supabase-storage';

describe('extractStoragePath', () => {
  // Achado de auditoria de segurança (07/09): documentos (certificados,
  // FDS, notas fiscais) tinham URL pública guardada no banco. Pra migrar
  // pra URL assinada sem precisar mexer no dado já salvo, esta função
  // extrai o caminho de dentro do bucket a partir dessa URL — é o que
  // permite gerar uma URL assinada nova a qualquer momento.

  it('extrai o caminho de uma URL pública completa do Supabase', () => {
    const url =
      'https://exemplo.supabase.co/storage/v1/object/public/certificates/fds/lom/167-arquivo.pdf';
    expect(extractStoragePath('certificates', url)).toBe('fds/lom/167-arquivo.pdf');
  });

  it('decodifica caracteres de URL (espaços, acentos) no caminho', () => {
    const url =
      'https://exemplo.supabase.co/storage/v1/object/public/certificates/fds/Ficha%20de%20Dados.pdf';
    expect(extractStoragePath('certificates', url)).toBe('fds/Ficha de Dados.pdf');
  });

  it('devolve o valor como está quando já é só o caminho (sem URL completa)', () => {
    expect(extractStoragePath('certificates', 'fds/lom/167-arquivo.pdf')).toBe('fds/lom/167-arquivo.pdf');
  });

  it('nao confunde o nome do bucket com parte do caminho do arquivo', () => {
    // Um arquivo cujo NOME contém a palavra "certificates" nao deve
    // quebrar a extração do marcador "/object/public/certificates/".
    const url =
      'https://exemplo.supabase.co/storage/v1/object/public/certificates/certificates-antigos/167-x.pdf';
    expect(extractStoragePath('certificates', url)).toBe('certificates-antigos/167-x.pdf');
  });
});
