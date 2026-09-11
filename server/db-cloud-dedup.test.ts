import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListFolderContents = vi.fn();
const mockMoveFile = vi.fn();
const mockMoveFolder = vi.fn();
const mockSoftDeleteFolder = vi.fn();
const mockGetFolderPath = vi.fn();

vi.mock('./db-cloud', () => ({
  listFolderContents: (...args: unknown[]) => mockListFolderContents(...args),
  moveFile: (...args: unknown[]) => mockMoveFile(...args),
  moveFolder: (...args: unknown[]) => mockMoveFolder(...args),
  softDeleteFolder: (...args: unknown[]) => mockSoftDeleteFolder(...args),
  getFolderPath: (...args: unknown[]) => mockGetFolderPath(...args),
}));

describe('mergeFolderInto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('move todos os arquivos e subpastas SEM conflito de nome pra dentro da pasta mantida', async () => {
    mockListFolderContents.mockImplementation((_contract: string, folderId: string) => {
      if (folderId === 'source') {
        return Promise.resolve({
          files: [{ id: 'file-1', name: 'foto.jpg' }],
          folders: [{ id: 'subfolder-1', name: 'Fotos 2025' }],
        });
      }
      return Promise.resolve({ files: [], folders: [] }); // target vazia
    });

    const { mergeFolderInto } = await import('./db-cloud-dedup');
    const result = await mergeFolderInto('source', 'target', 'lom', 'admin');

    expect(mockMoveFile).toHaveBeenCalledWith('file-1', 'lom', 'target');
    expect(mockMoveFolder).toHaveBeenCalledWith('subfolder-1', 'lom', 'target');
    expect(mockSoftDeleteFolder).toHaveBeenCalledWith('source', 'lom', 'admin');
    expect(result).toEqual({ filesMoved: 1, foldersMoved: 1, foldersMerged: 0 });
  });

  it('mescla recursivamente quando uma subpasta tem o MESMO nome dos dois lados (achado real: duplicata aninhada)', async () => {
    // Cenario real: "SSMA" duplicada, e cada uma das duas tem sua propria
    // subpasta "CIPAMIN" - so MOVER a subpasta criaria outra duplicata um
    // nivel mais pra dentro. Precisa mesclar recursivamente.
    mockListFolderContents.mockImplementation((_contract: string, folderId: string) => {
      if (folderId === 'source-ssma') {
        return Promise.resolve({
          files: [],
          folders: [{ id: 'source-cipamin', name: 'CIPAMIN' }],
        });
      }
      if (folderId === 'target-ssma') {
        return Promise.resolve({
          files: [],
          folders: [{ id: 'target-cipamin', name: 'cipamin' }], // caixa diferente de proposito
        });
      }
      if (folderId === 'source-cipamin') {
        return Promise.resolve({ files: [{ id: 'file-x', name: 'ata.pdf' }], folders: [] });
      }
      if (folderId === 'target-cipamin') {
        return Promise.resolve({ files: [], folders: [] });
      }
      return Promise.resolve({ files: [], folders: [] });
    });

    const { mergeFolderInto } = await import('./db-cloud-dedup');
    const result = await mergeFolderInto('source-ssma', 'target-ssma', 'lom', 'admin');

    // O arquivo de dentro da CIPAMIN duplicada foi pro CIPAMIN que ficou.
    expect(mockMoveFile).toHaveBeenCalledWith('file-x', 'lom', 'target-cipamin');
    // As DUAS pastas (a CIPAMIN duplicada E a SSMA duplicada) viram lixeira.
    expect(mockSoftDeleteFolder).toHaveBeenCalledWith('source-cipamin', 'lom', 'admin');
    expect(mockSoftDeleteFolder).toHaveBeenCalledWith('source-ssma', 'lom', 'admin');
    // moveFolder NUNCA foi chamado pra CIPAMIN (foi mesclada, não movida).
    expect(mockMoveFolder).not.toHaveBeenCalledWith('source-cipamin', 'lom', expect.anything());
    expect(result.foldersMerged).toBe(1);
    expect(result.filesMoved).toBe(1);
  });

  it('não faz nada quando source e target são a mesma pasta (proteção contra chamada acidental)', async () => {
    const { mergeFolderInto } = await import('./db-cloud-dedup');
    const result = await mergeFolderInto('same-id', 'same-id', 'lom', 'admin');

    expect(mockListFolderContents).not.toHaveBeenCalled();
    expect(mockSoftDeleteFolder).not.toHaveBeenCalled();
    expect(result).toEqual({ filesMoved: 0, foldersMoved: 0, foldersMerged: 0 });
  });
});

describe('findDuplicateFolderGroups', () => {
  const mockGetDb = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.doMock('./db', () => ({ getDb: () => mockGetDb() }));
  });

  it('agrupa pastas com o mesmo nome (sem diferenciar caixa) no mesmo pai', async () => {
    vi.resetModules();
    vi.doMock('./db', () => ({ getDb: () => mockGetDb() }));
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 'a1', contractSlug: 'lom', parentId: null, name: 'SSMA', createdAt: new Date('2026-01-01') },
              { id: 'a2', contractSlug: 'lom', parentId: null, name: 'ssma', createdAt: new Date('2026-01-02') },
              { id: 'b1', contractSlug: 'lom', parentId: null, name: 'Almoxarifado', createdAt: new Date('2026-01-01') },
            ]),
        }),
      }),
    });
    mockListFolderContents.mockResolvedValue({ files: [], folders: [] });

    const { findDuplicateFolderGroups } = await import('./db-cloud-dedup');
    const groups = await findDuplicateFolderGroups('lom');

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('SSMA');
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a1', 'a2']); // mais antiga primeiro
  });
});
