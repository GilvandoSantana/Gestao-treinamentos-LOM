/**
 * Upload em PARTES (não numa requisição só) — extraído de
 * DesktopInstallerPanel.tsx pra ser reaproveitado também pelo upload de
 * arquivo da Nuvem (client/src/components/CloudBrowser.tsx).
 *
 * Motivo de existir: a Railway tem um limite rígido de 5 minutos por
 * requisição HTTP, e antes o upload da Nuvem mandava o arquivo inteiro
 * como uma string Base64 numa única chamada — um arquivo de 200MB virava
 * uns 267MB em Base64, e ainda ficava inteiro na memória em várias cópias
 * ao mesmo tempo (string JSON, Buffer, SDK do S3), correndo o risco real
 * de derrubar o container do Railway com pouca memória (achado de
 * auditoria de segurança, 07/09). Dividido em pedaços de alguns MB, cada
 * requisição fica pequena e o pico de memória nunca passa de um pedaço
 * por vez.
 */

import { getSessionMarker } from './session-marker';

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB por pedaço
const MAX_RETRIES_PER_PART = 2;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const marker = getSessionMarker();
  return { ...extra, ...(marker ? { 'x-session-marker': marker } : {}) };
}

export interface ChunkedUploadEndpoints {
  /** Recebe { ...startBody }, devolve { uploadId, ...qualquer coisa extra }. */
  start: string;
  /** Recebe o pedaço em bytes crus, com uploadId/partNumber na URL (query). */
  part: string;
  /** Recebe { uploadId, parts, fileSize, ...completeBody }, devolve o resultado final. */
  complete: string;
}

/**
 * Sobe um arquivo em pedaços, com nova tentativa automática por pedaço
 * (não o envio inteiro) e progresso reportado de 0 a 100. Devolve
 * exatamente o que a rota de "completar" respondeu — cada chamador decide
 * o que fazer com isso (o instalador só confere sucesso; a Nuvem usa pra
 * pegar o registro do arquivo criado).
 */
export async function uploadFileInChunks<T = unknown>(
  file: File,
  startBody: Record<string, unknown>,
  endpoints: ChunkedUploadEndpoints,
  onProgress: (percent: number) => void,
  completeBody: Record<string, unknown> = {}
): Promise<T> {
  // 1. Inicia o envio em partes.
  const startRes = await fetch(endpoints.start, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(startBody),
  });
  if (!startRes.ok) {
    const body = await startRes.json().catch(() => null);
    throw new Error(body?.error || `Erro ${startRes.status} ao iniciar o envio.`);
  }
  const { uploadId } = await startRes.json();

  // 2. Envia cada pedaço, um de cada vez (mais simples e confiável que
  // paralelo, e a velocidade não é o gargalo aqui — é o limite de tempo
  // por requisição).
  const totalParts = Math.ceil(file.size / CHUNK_SIZE) || 1;
  const parts: { partNumber: number; etag: string }[] = [];

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const buffer = await chunk.arrayBuffer();
    const partNumber = i + 1;

    let lastError: unknown = null;
    let etag: string | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_PART; attempt++) {
      try {
        const partRes = await fetch(
          `${endpoints.part}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
            body: buffer,
          }
        );
        if (!partRes.ok) {
          const body = await partRes.json().catch(() => null);
          throw new Error(body?.error || `Erro ${partRes.status} ao enviar a parte ${partNumber}.`);
        }
        const data = await partRes.json();
        etag = data.etag;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!etag) {
      throw lastError instanceof Error ? lastError : new Error(`Falha ao enviar a parte ${partNumber}.`);
    }

    parts.push({ partNumber, etag });
    onProgress(Math.round(((i + 1) / totalParts) * 100));
  }

  // 3. Junta tudo num arquivo só, de verdade, no destino final.
  const completeRes = await fetch(endpoints.complete, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ uploadId, parts, fileSize: file.size, ...completeBody }),
  });
  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => null);
    throw new Error(body?.error || `Erro ${completeRes.status} ao concluir o envio.`);
  }
  return completeRes.json();
}
