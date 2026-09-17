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
// Achado real (Gilvando, 17/09): "pasta com arquivo dentro só criou a
// pasta vazia, sem nenhum aviso — nem erro nem sucesso". Sem limite de
// tempo, um fetch() que trava numa conexão instável (comum com certas
// redes/proxies — a conexão fica "aberta" mas nunca responde) esperaria
// pra sempre, sem NUNCA cair no catch nem no toast final — exatamente
// esse silêncio. Com o limite, uma chamada travada é abortada e cai na
// nova tentativa já existente (ou no erro final, se as tentativas
// também travarem), garantindo que algo SEMPRE aparece pra pessoa.
const FETCH_TIMEOUT_MS = 30_000;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const marker = getSessionMarker();
  return { ...extra, ...(marker ? { 'x-session-marker': marker } : {}) };
}

/** fetch() com limite de tempo — sem isso, uma conexão travada (comum em
 * redes/proxies instáveis) espera pra sempre, sem cair em erro nem sucesso. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`A conexão não respondeu em ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Corre uma promessa contra um limite de tempo — sem isso, uma chamada
 * tRPC travada (achado real, Gilvando 17/09: pasta com arquivo dentro só
 * criou a pasta vazia, sem nenhum aviso — nem erro nem sucesso) esperaria
 * pra sempre, sem NUNCA cair no catch nem no toast final. Só cria uma
 * mensagem de erro clara se o limite bater; não cancela a chamada de
 * verdade por dentro (o navegador não permite cancelar uma chamada tRPC
 * assim tão facilmente) — mas pelo menos a PESSOA nunca fica sem
 * resposta nenhuma. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`"${label}" não respondeu em ${Math.round(timeoutMs / 1000)}s.`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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
  const startRes = await fetchWithTimeout(endpoints.start, {
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
        const partRes = await fetchWithTimeout(
          `${endpoints.part}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
          {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
            body: buffer,
          },
          60_000 // pedaço carrega dado de verdade (até 8MB) — numa conexão lenta, 30s pode não bastar
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
  const completeRes = await fetchWithTimeout(
    endpoints.complete,
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uploadId, parts, fileSize: file.size, ...completeBody }),
    },
    60_000 // o servidor pode levar um tempo pra juntar as partes de verdade
  );
  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => null);
    throw new Error(body?.error || `Erro ${completeRes.status} ao concluir o envio.`);
  }
  return completeRes.json();
}
