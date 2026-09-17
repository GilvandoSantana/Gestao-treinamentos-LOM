import { describe, it, expect } from 'vitest';
import { readEntry, type FileWithPath } from './cloud-drop-read';

/** Simula um FileSystemFileEntry — o navegador entrega um Blob/File já
 * pronto via callback, é isso que fingimos aqui. */
function makeFileEntry(name: string, content = 'conteudo'): FileSystemEntry {
  const file = new File([content], name, { type: 'text/plain' });
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (successCallback: (file: File) => void) => successCallback(file),
  } as unknown as FileSystemEntry;
}

/** Simula um FileSystemDirectoryEntry — createReader().readEntries(cb) é
 * chamado repetidamente pelo código real até devolver um lote vazio (é
 * assim que o Chrome de verdade se comporta, entregando os itens em vários
 * lotes). Aqui devolvemos tudo de uma vez no primeiro lote, e um lote vazio
 * na segunda chamada — cobre o caso mais simples corretamente.
 */
function makeDirEntry(name: string, children: FileSystemEntry[]): FileSystemEntry {
  let call = 0;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (callback: (entries: FileSystemEntry[]) => void) => {
        call++;
        callback(call === 1 ? children : []);
      },
    }),
  } as unknown as FileSystemEntry;
}

describe('readEntry', () => {
  it('lê um arquivo solto corretamente', async () => {
    const results: FileWithPath[] = [];
    await readEntry(makeFileEntry('relatorio.txt'), '', results);
    expect(results).toEqual([{ file: expect.anything(), relativePath: 'relatorio.txt' }]);
  });

  it('lê uma pasta com um arquivo dentro — o caso central deste achado (Gilvando, 17/09: só a pasta vazia passava)', async () => {
    const results: FileWithPath[] = [];
    const folder = makeDirEntry('SSMA', [makeFileEntry('funcionou.txt')]);
    await readEntry(folder, '', results);
    expect(results).toHaveLength(1);
    expect(results[0].relativePath).toBe('SSMA/funcionou.txt');
  });

  it('lê pasta com vários arquivos dentro', async () => {
    const results: FileWithPath[] = [];
    const folder = makeDirEntry('Documentos', [makeFileEntry('a.txt'), makeFileEntry('b.txt')]);
    await readEntry(folder, '', results);
    expect(results.map((r) => r.relativePath).sort()).toEqual(['Documentos/a.txt', 'Documentos/b.txt']);
  });

  it('lê subpasta de vários níveis de profundidade', async () => {
    const results: FileWithPath[] = [];
    const fundo = makeDirEntry('C', [makeFileEntry('fundo.txt')]);
    const meio = makeDirEntry('B', [fundo]);
    const topo = makeDirEntry('A', [meio]);
    await readEntry(topo, '', results);
    expect(results[0].relativePath).toBe('A/B/C/fundo.txt');
  });

  it('pasta vazia não adiciona nada aos resultados, sem quebrar', async () => {
    const results: FileWithPath[] = [];
    await readEntry(makeDirEntry('Vazia', []), '', results);
    expect(results).toEqual([]);
  });

  it('lida corretamente com o navegador entregando os itens em VÁRIOS lotes (comportamento real do Chrome)', async () => {
    const results: FileWithPath[] = [];
    let call = 0;
    const files = [makeFileEntry('um.txt'), makeFileEntry('dois.txt'), makeFileEntry('tres.txt')];
    const folder = {
      isFile: false,
      isDirectory: true,
      name: 'Lotes',
      createReader: () => ({
        readEntries: (callback: (entries: FileSystemEntry[]) => void) => {
          call++;
          // Cada chamada devolve UM item, até esgotar — igual o Chrome faz
          // de verdade com pastas grandes.
          if (call <= files.length) callback([files[call - 1]]);
          else callback([]);
        },
      }),
    } as unknown as FileSystemEntry;

    await readEntry(folder, '', results);
    expect(results.map((r) => r.relativePath).sort()).toEqual(['Lotes/dois.txt', 'Lotes/tres.txt', 'Lotes/um.txt']);
  });
});
