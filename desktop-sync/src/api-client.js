/**
 * Cliente HTTP pra API do sistema (tRPC) — feito à mão, sem o pacote
 * @trpc/client, porque esse pacote espera o tipo do AppRouter (TypeScript)
 * do projeto principal, e este é um programa separado, mais simples de
 * manter sem essa dependência cruzada. Replica exatamente o formato de
 * requisição que o tRPC usa por baixo dos panos:
 * - Consulta (query): GET com `?batch=1&input=<JSON codificado na URL>`
 * - Mutação: POST com corpo `{"0":{"json": <dados> }}`
 */

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
  async login(username, password) {
    const url = new URL("/api/trpc/auth.desktopLogin?batch=1", this.serverUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: this.serverUrl },
      body: JSON.stringify({ "0": { json: { username: username || undefined, password } } }),
    });
    const data = await parseTrpcResponse(res);
    this.token = data.token;
    return { username: data.username };
  }

  /** Confirma se o token guardado ainda é válido e devolve os dados da sessão. */
  async getSession() {
    const url = buildQueryUrl(this.serverUrl, "auth.siteSession");
    const res = await fetch(url, { headers: this._authHeaders() });
    return parseTrpcResponse(res);
  }

  /** Lista os contratos existentes — só administrador principal enxerga
   * mais de um; usado na configuração inicial pra escolher qual
   * contrato sincronizar. */
  async listContracts() {
    const url = buildQueryUrl(this.serverUrl, "contracts.list");
    const res = await fetch(url, { headers: this._authHeaders() });
    return parseTrpcResponse(res);
  }

  /** Lista os arquivos de uma pasta da Nuvem (null = pasta raiz do contrato). */
  async listCloudFiles(folderId) {
    const url = buildQueryUrl(this.serverUrl, "cloud.list", { folderId: folderId ?? null });
    const res = await fetch(url, { headers: this._authHeaders() });
    const data = await parseTrpcResponse(res);
    return data.files;
  }

  /** Baixa o conteúdo de um arquivo da Nuvem como Buffer. */
  async downloadCloudFile(fileId) {
    const urlRes = await fetch(new URL("/api/trpc/cloud.getDownloadUrl?batch=1", this.serverUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({ "0": { json: { id: fileId } } }),
    });
    const { url } = await parseTrpcResponse(urlRes);
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new ApiError("Falha ao baixar o conteúdo do arquivo.", fileRes.status);
    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** Envia um arquivo novo (que só existe localmente) pra Nuvem. */
  async uploadNewFile(folderId, name, buffer, mimeType) {
    const url = new URL("/api/trpc/cloud.upload?batch=1", this.serverUrl).toString();
    const res = await fetch(url, {
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
    return { id: data.id, updatedAt: data.updatedAt };
  }

  /** Envia uma nova versão de um arquivo que já existe na Nuvem. */
  async uploadNewVersion(fileId, buffer, name, mimeType) {
    const url = new URL("/api/trpc/cloud.uploadNewVersion?batch=1", this.serverUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this._authHeaders() },
      body: JSON.stringify({
        "0": {
          json: {
            fileId,
            fileName: name,
            fileData: buffer.toString("base64"),
            mimeType: mimeType || "application/octet-stream",
          },
        },
      }),
    });
    const data = await parseTrpcResponse(res);
    return { updatedAt: data.updatedAt };
  }
}

module.exports = { ApiClient, ApiError };
