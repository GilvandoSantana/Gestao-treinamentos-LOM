/**
 * Cliente HTTP pra API do sistema (tRPC) — feito à mão, sem o pacote
 * @trpc/client, porque esse pacote espera o tipo do AppRouter (TypeScript)
 * do projeto principal, e este é um programa separado, mais simples de
 * manter sem essa dependência cruzada. Replica exatamente o formato de
 * requisição que o tRPC usa por baixo dos panos:
 * - Consulta (query): GET com `?batch=1&input=<JSON codificado na URL>`
 * - Mutação: POST com corpo `{"0":{"json": <dados> }}`
 */

const os = require("os");
const fsp = require("fs/promises");
async function fetchWithDeadline(url, options = {}) {
  const timeout = AbortSignal.timeout(120000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  return fetch(url, { ...options, signal });
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildQueryUrl(serverUrl, path, input) {
  const url = new URL(`/api/trpc/${path}`, serverUrl);
  url.searchParams.set("batch", "1");
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify({ "0": { json: input } }));
  }
  return url.toString();
}

async function parseTrpcResponse(res) {
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(`Resposta inesperada do servidor (não é JSON): ${text.slice(0, 200)}`, res.status);
  }
  const entry = Array.isArray(body) ? body[0] : body;
  if (entry && entry.error) {
    const message = entry.error.json?.message || "Erro desconhecido do servidor.";
    throw new ApiError(message, entry.error.json?.data?.httpStatus ?? res.status);
  }
  if (!res.ok) {
    throw new ApiError(`Erro HTTP ${res.status} ao falar com o servidor.`, res.status);
  }
  return entry?.result?.data?.json;
}

class ApiClient {
  /** @param {string} serverUrl - ex: "https://meusite.up.railway.app" */
  constructor(serverUrl) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.token = null;
    /** Contrato ativo (só importa pra contas de administrador principal,
     * que enxergam vários contratos — uma conta comum já tem um só, fixo,
     * e esse valor é ignorado pelo servidor nesse caso). */
    this.activeContract = null;
  }

  setToken(token) {
    this.token = token;
  }

  setActiveContract(contractSlug) {
    this.activeContract = contractSlug;
  }

  _authHeaders() {
    if (!this.token) throw new ApiError("Não conectado — faça login primeiro.", 401);
    const headers = {
      Authorization: `Bearer ${this.token}`,
      // Mesmo Origin do servidor de verdade — um cliente que não é
      // navegador consegue mandar isso sozinho (só um navegador de
      // verdade é impedido de deixar uma página forjar esse cabeçalho),
      // e é exatamente o que a proteção contra CSRF do servidor espera
      // ver numa requisição legítima.
      Origin: this.serverUrl,
    };
    if (this.activeContract) {
      headers["x-active-contract"] = this.activeContract;
    }
    return headers;
  }

  /** Faz login e guarda o token internamente. Devolve {username}. */
  async login(username, password, twoFactorCode) {
    const url = new URL("/api/trpc/auth.desktopLogin?batch=1", this.serverUrl).toString();
    // Nome do computador, sugerido automaticamente — aparece na tela de
    // "Dispositivos conectados" do administrador, permitindo revogar só
    // este computador (sem esse nome, tudo aparecia genérico e sem jeito
    // de saber qual token pertence a qual máquina — achado de auditoria
    // de segurança, 07/09).
    let deviceName;
    try {
      deviceName = os.hostname();
    } catch {
      deviceName = undefined;
    }
    const res = await fetchWithDeadline(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: this.serverUrl },
      body: JSON.stringify({ "0": { json: { username: username || undefined, password, deviceName, twoFactorCode: twoFactorCode || undefined } } }),
    });
    const data = await parseTrpcResponse(res);
    this.token = data.token;
    return { username: data.username };
  }

  /** Confirma se o token guardado ainda é válido e devolve os dados da sessão. */
  async getSession() {
    const url = buildQueryUrl(this.serverUrl, "auth.siteSession");
    const res = await fetchWithDeadline(url, { headers: this._authHeaders() });
    return parseTrpcResponse(res);
  }

  /** Lista os contratos existentes — só administrador principal enxerga
   * mais de um; usado na configuração inicial pra escolher qual
   * contrato sincronizar. */
  async listContracts() {
    const url = buildQueryUrl(this.serverUrl, "contracts.list");
    const res = await fetchWithDeadline(url, { headers: this._authHeaders() });
    return parseTrpcResponse(res);
  }

  /** Lista pastas e arquivos de uma pasta da Nuvem (null = raiz do contrato). */
  async listFolder(folderId) {
    const url = buildQueryUrl(this.serverUrl, "cloud.list", { folderId: folderId ?? null });
    const res = await fetchWithDeadline(url, { headers: this._authHeaders() });
    return parseTrpcResponse(res);
  }

  /** Busca a árvore inteira (todas as pastas e arquivos do contrato) numa
   * chamada só — bem mais rápido que listFolder pasta por pasta pra
   * montar o manifesto inteiro (ver generateManifestEntries). */
  async getFullTree() {
    const url = buildQueryUrl(this.serverUrl, "cloud.getFullTree");
    const res = await fetchWithDeadline(url, { headers: this._authHeaders() });
    return parseTrpcResponse(res);
  }

  /** Baixa o conteúdo de um arquivo da Nuvem como Buffer. */
  async downloadCloudFile(fileId) {
    const urlRes = await fetchWithDeadline(new URL("/api/trpc/cloud.getDownloadUrl?batch=1", this.serverUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({ "0": { json: { id: fileId } } }),
    });
    const { url } = await parseTrpcResponse(urlRes);
    const fileRes = await fetchWithDeadline(url);
    if (!fileRes.ok) throw new ApiError("Falha ao baixar o conteúdo do arquivo.", fileRes.status);
    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** Cria uma pasta nova na Nuvem (espelhando uma pasta criada no
   * computador). Exige permissão de gerenciar a Nuvem, não só visualizar —
   * uma conta só-leitura vai receber erro aqui, tratado como um item de
   * log de erro pelo motor de sincronização, sem derrubar o programa. */
  async createRemoteFolder(parentId, name) {
    const url = new URL("/api/trpc/cloud.createFolder?batch=1", this.serverUrl).toString();
    const res = await fetchWithDeadline(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({ "0": { json: { parentId: parentId ?? null, name } } }),
    });
    const data = await parseTrpcResponse(res);
    return { id: data.id };
  }

  /** Move um arquivo pra lixeira da Nuvem (não apaga de vez — dá pra
   * recuperar depois pela tela do site). */
  async deleteFile(fileId) {
    const url = new URL("/api/trpc/cloud.deleteFile?batch=1", this.serverUrl).toString();
    const res = await fetchWithDeadline(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({ "0": { json: { id: fileId } } }),
    });
    await parseTrpcResponse(res);
  }

  /** Move uma pasta (e tudo dentro dela) pra lixeira da Nuvem — mesma
   * garantia de recuperação do deleteFile. */
  async deleteFolder(folderId) {
    const url = new URL("/api/trpc/cloud.deleteFolder?batch=1", this.serverUrl).toString();
    const res = await fetchWithDeadline(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({ "0": { json: { id: folderId } } }),
    });
    await parseTrpcResponse(res);
  }

  async getFileInfo(fileId) {
    return parseTrpcResponse(await fetchWithDeadline(buildQueryUrl(this.serverUrl, 'cloud.getFileInfo', { fileId }), { headers: this._authHeaders() }));
  }

  cancelTransfers() { this.transferController?.abort(); this.transferController = null; }

  async uploadLocalFile(localPath, { fileId, folderId, name, expectedRevision, onProgress = () => {} }) {
    const handle = await fsp.open(localPath, 'r');
    const controller = this.transferController ??= new AbortController();
    const signal = controller.signal;
    const base = fileId ? '/api/cloud-version-upload' : '/api/cloud-upload';
    let uploadId;
    const json = async (endpoint, body) => {
      const res = await fetchWithDeadline(new URL(base + endpoint, this.serverUrl), {
        method: 'POST', headers: { ...this._authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal,
      });
      const data = await res.json();
      if (!res.ok) throw new ApiError(data.error || 'Falha no envio.', res.status);
      return data;
    };
    try {
      const before = await handle.stat();
      if (before.size === 0) return fileId
        ? { id: fileId, ...await this.uploadNewVersion(fileId, Buffer.alloc(0), name, undefined, expectedRevision) }
        : this.uploadNewFile(folderId, name, Buffer.alloc(0));
      const started = await json('/start', { fileId, folderId: folderId ?? null, name, fileName: name, fileSize: before.size, mimeType: 'application/octet-stream', expectedRevision });
      uploadId = started.uploadId;
      const chunk = Buffer.alloc(8 * 1024 * 1024);
      let offset = 0, partNumber = 0;
      while (offset < before.size) {
        const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, before.size - offset), offset);
        if (!bytesRead) throw new Error('O arquivo mudou durante o envio. Será verificado novamente.');
        partNumber++;
        for (let attempt = 0; ; attempt++) {
          try {
            const url = new URL(base + '/part', this.serverUrl);
            url.searchParams.set('uploadId', uploadId); url.searchParams.set('partNumber', String(partNumber));
            const res = await fetchWithDeadline(url, { method: 'POST', headers: { ...this._authHeaders(), 'Content-Type': 'application/octet-stream' }, body: chunk.subarray(0, bytesRead), signal });
            const data = await res.json();
            if (!res.ok) throw new ApiError(data.error || 'Falha no envio da parte.', res.status);
            break;
          } catch (error) {
            if (signal.aborted || attempt >= 2 || (error.status && error.status < 500)) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
          }
        }
        offset += bytesRead; onProgress(Math.round(100 * offset / before.size));
      }
      const after = await handle.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('O arquivo mudou durante o envio. Sua cópia local foi preservada.');
      const completed = await json('/complete', { uploadId });
      if (!completed.success || !completed.file || completed.file.fileSize !== before.size) throw new Error('Servidor não confirmou o arquivo completo.');
      return completed.file;
    } catch (error) {
      if (uploadId) {
        await fetchWithDeadline(new URL(base + '/abort', this.serverUrl), {
          method: 'POST', headers: { ...this._authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId }),
        }).catch(() => {});
      }
      throw error;
    } finally { await handle.close(); }
  }

  /** Envia um arquivo novo (que só existe localmente) pra Nuvem. */
  async uploadNewFile(folderId, name, buffer, mimeType) {
    const url = new URL("/api/trpc/cloud.upload?batch=1", this.serverUrl).toString();
    const res = await fetchWithDeadline(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({
        "0": {
          json: {
            folderId: folderId ?? null,
            name,
            fileName: name,
            fileData: buffer.toString("base64"),
            mimeType: mimeType || "application/octet-stream",
          },
        },
      }),
    });
    const data = await parseTrpcResponse(res);
    return { id: data.id, updatedAt: data.updatedAt, revisionToken: data.revisionToken };
  }

  /** Envia uma nova versão de um arquivo que já existe na Nuvem. */
  async uploadNewVersion(fileId, buffer, name, mimeType, expectedRevision) {
    const url = new URL("/api/trpc/cloud.uploadNewVersion?batch=1", this.serverUrl).toString();
    const res = await fetchWithDeadline(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({
        "0": {
          json: {
            fileId,
            expectedRevision,
            fileName: name,
            fileData: buffer.toString("base64"),
            mimeType: mimeType || "application/octet-stream",
          },
        },
      }),
    });
    const data = await parseTrpcResponse(res);
    return { updatedAt: data.updatedAt, revisionToken: data.revisionToken };
  }
}

module.exports = { ApiClient, ApiError };

