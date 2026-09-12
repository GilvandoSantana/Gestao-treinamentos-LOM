import { describe, it, expect } from 'vitest';
import { computeStorageByTopFolder } from './db-cloud';

describe('computeStorageByTopFolder', () => {
  it('soma o tamanho de arquivos direto na pasta raiz (folderId null)', () => {
    const result = computeStorageByTopFolder(
      [],
      [
        { folderId: null, fileSize: 1000 },
        { folderId: null, fileSize: 500 },
      ]
    );

    expect(result).toEqual([{ folderId: null, folderName: 'Meus arquivos (raiz)', totalBytes: 1500, fileCount: 2 }]);
  });

  it('soma arquivo de subpasta dentro da pasta de nível raiz correta (recursivo)', () => {
    // SSMA > CIPAMIN > ata.pdf - o tamanho conta pra "SSMA", nao pra
    // "CIPAMIN" separadamente, ja que so pastas de NIVEL RAIZ aparecem
    // no resultado.
    const result = computeStorageByTopFolder(
      [
        { id: 'ssma', name: 'SSMA', parentId: null },
        { id: 'cipamin', name: 'CIPAMIN', parentId: 'ssma' },
      ],
      [{ folderId: 'cipamin', fileSize: 2000 }]
    );

    expect(result).toEqual([{ folderId: 'ssma', folderName: 'SSMA', totalBytes: 2000, fileCount: 1 }]);
  });

  it('ordena do maior espaço ocupado pro menor', () => {
    const result = computeStorageByTopFolder(
      [
        { id: 'a', name: 'Pequena', parentId: null },
        { id: 'b', name: 'Grande', parentId: null },
      ],
      [
        { folderId: 'a', fileSize: 100 },
        { folderId: 'b', fileSize: 9000 },
      ]
    );

    expect(result.map((r) => r.folderName)).toEqual(['Grande', 'Pequena']);
  });

  it('trata fileSize null como zero, sem quebrar', () => {
    const result = computeStorageByTopFolder([], [{ folderId: null, fileSize: null }]);
    expect(result).toEqual([{ folderId: null, folderName: 'Meus arquivos (raiz)', totalBytes: 0, fileCount: 1 }]);
  });

  it('devolve lista vazia quando não há nenhum arquivo', () => {
    expect(computeStorageByTopFolder([], [])).toEqual([]);
  });

  it('agrupa corretamente duas pastas de nível raiz diferentes, cada uma com sua própria subpasta', () => {
    const result = computeStorageByTopFolder(
      [
        { id: 'aet', name: 'AET', parentId: null },
        { id: 'cipamin', name: 'CIPAMIN', parentId: null },
        { id: 'aet-sub', name: 'Antigos', parentId: 'aet' },
      ],
      [
        { folderId: 'aet', fileSize: 100 },
        { folderId: 'aet-sub', fileSize: 200 },
        { folderId: 'cipamin', fileSize: 50 },
      ]
    );

    const aet = result.find((r) => r.folderName === 'AET');
    const cipamin = result.find((r) => r.folderName === 'CIPAMIN');
    expect(aet).toEqual({ folderId: 'aet', folderName: 'AET', totalBytes: 300, fileCount: 2 });
    expect(cipamin).toEqual({ folderId: 'cipamin', folderName: 'CIPAMIN', totalBytes: 50, fileCount: 1 });
  });
});
