import { describe, it, expect } from 'vitest';
import { normalizePermissions, ALL_PERMISSIONS } from './permissions';

describe('normalizePermissions', () => {
  it('administrador principal sempre recebe tudo liberado, ignorando o "raw"', () => {
    // Mesmo que o dado bruto diga que tudo é falso, papel "admin" sempre
    // ganha tudo — é assim que o administrador principal nunca fica
    // trancado fora de nenhuma tela por engano.
    const result = normalizePermissions('{}', 'admin');
    expect(result).toEqual(ALL_PERMISSIONS);
  });

  it('administrador principal recebe tudo mesmo com raw null/undefined', () => {
    expect(normalizePermissions(null, 'admin')).toEqual(ALL_PERMISSIONS);
    expect(normalizePermissions(undefined, 'admin')).toEqual(ALL_PERMISSIONS);
  });

  it('usuário comum: interpreta uma string JSON válida corretamente', () => {
    const result = normalizePermissions(
      JSON.stringify({ viewEmployees: true, editEmployees: true }),
      'user'
    );
    expect(result.viewEmployees).toBe(true);
    expect(result.editEmployees).toBe(true);
    expect(result.deleteEmployees).toBe(false);
  });

  it('usuário comum: aceita também um objeto já pronto (não precisa ser string)', () => {
    const result = normalizePermissions({ viewCloud: true }, 'user');
    expect(result.viewCloud).toBe(true);
    expect(result.manageCloud).toBe(false);
  });

  it('JSON quebrado vira tudo negado, em vez de travar', () => {
    const result = normalizePermissions('{isso não é json válido', 'user');
    for (const value of Object.values(result)) {
      expect(value).toBe(false);
    }
  });

  it('raw ausente (null/undefined) vira tudo negado', () => {
    const result = normalizePermissions(null, 'user');
    for (const value of Object.values(result)) {
      expect(value).toBe(false);
    }
    expect(normalizePermissions(undefined, 'user')).toEqual(result);
  });

  it('só aceita o valor exato "true" (booleano) — string "true" ou 1 não contam', () => {
    // Checagem estrita (===true) de propósito: um valor "parecido com
    // verdadeiro" vindo de um dado malformado nunca deveria liberar
    // acesso por acidente.
    const result = normalizePermissions({ viewEmployees: 'true', editEmployees: 1 }, 'user');
    expect(result.viewEmployees).toBe(false);
    expect(result.editEmployees).toBe(false);
  });

  it('ignora chaves desconhecidas — só as permissões válidas aparecem no resultado', () => {
    const result = normalizePermissions({ viewEmployees: true, chaveInventada: true }, 'user');
    expect(Object.keys(result).sort()).toEqual(Object.keys(ALL_PERMISSIONS).sort());
    expect((result as any).chaveInventada).toBeUndefined();
  });
});
