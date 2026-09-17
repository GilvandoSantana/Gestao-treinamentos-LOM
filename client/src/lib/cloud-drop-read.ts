/**
 * Lê recursivamente uma entrada arrastada (arquivo ou pasta) do navegador,
 * reconstruindo o caminho relativo — usado no arrastar-e-soltar de pastas
 * pra dentro da Nuvem (CloudBrowser.tsx). Extraído pra este arquivo pra
 * ficar testável sem precisar de um navegador de verdade — a API de
 * FileSystemEntry/FileSystemDirectoryReader do navegador é simulada nos
 * testes com objetos simples.
 */

export interface FileWithPath {
  file: File;
  relativePath: string;
}

export function readEntry(entry: FileSystemEntry, basePath: string, results: FileWithPath[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((file) => {
        results.push({ file, relativePath: basePath + file.name });
        resolve();
      });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (batch.length === 0) {
            for (const child of children) {
              await readEntry(child, `${basePath}${entry.name}/`, results);
            }
            resolve();
          } else {
            children.push(...batch);
            readBatch(); // o navegador pode devolver os itens em várias chamadas
          }
        });
      };
      readBatch();
    } else {
      resolve();
    }
  });
}
