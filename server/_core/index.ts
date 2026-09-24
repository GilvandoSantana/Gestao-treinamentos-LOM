import { registerDesktopUpdateRoutes } from "../desktop-update-routes";
import { registerCloudUploadRoutes } from "../cloud-upload-routes";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { timingSafeEqual, createHash } from "crypto";
import { serveStatic, setupVite } from "./vite";
import { sendTrainingAlerts } from "../email-service";
import { runDatabaseBackup } from "../db-backup";
import { nanoid } from "nanoid";
import { csrfProtection } from "./csrf";
import {
  getR2DownloadUrl,
  deleteFromR2,
  isR2Configured,
  createMultipartUpload,
  uploadPartToR2,
  completeMultipartUpload,
  abortMultipartUpload,
} from "../r2-storage";
import { getCurrentInstaller, setCurrentInstaller } from "../db-desktop-installer";
import {
  canAccessFile,
  canAccessFolder,
  getStorageInfo,
  createFileRecord,
  adjustStorageUsed,
  getFolderPath,
  getFileById,
  isLockActive,
  uploadNewVersion,
} from "../db-cloud";
import { slugifyContract } from "@shared/contracts";
import { logActivity } from "../db-activity";

// Comparação em tempo constante pro CRON_SECRET — mesmo cuidado já usado
// pra APP_PASSWORD em site-auth.ts (achado de auditoria de segurança,
// 15/09). Timing attack contra um endpoint de cron é um risco baixo na
// prática, mas o custo de corrigir é minimo e mantém o mesmo padrão em
// todo o servidor.
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufB, bufB);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
import { getStripe, getStripeWebhookSecret } from "../stripe-client";
import { finalizePaidSignup, ensureIntegrityTables } from "../db-organizations";
import { v4 as uuidv4 } from "uuid";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Initialize email service
  console.log("[Server] Initializing email service for training alerts...");
  const app = express();
  // Necessário para que req.ip reflita o IP real do cliente (Railway roda
  // atrás de um proxy reverso) — usado pelo rate limit do login do site.
  app.set("trust proxy", true);
  
  // Initialize database connection early
  const { getDb } = await import("../db");
  try {
    await getDb();
    console.log("[Server] Database connected successfully");
  } catch (error) {
    console.warn("[Server] Database connection warning:", error);
  }
  await ensureIntegrityTables();
  const server = createServer(app);
  // Cabecalhos de seguranca HTTP padrao (X-Content-Type-Options,
  // X-Frame-Options, Referrer-Policy, HSTS, etc). Content-Security-Policy
  // e as politicas de cross-origin ficam desligadas por enquanto: o app
  // carrega imagens/fotos de origens externas (Supabase, R2, Google) e
  // gera downloads via blob: URL (crachas, fichas, relatorios) - uma CSP
  // mal calibrada quebraria essas telas silenciosamente. Ajustar a CSP
  // exige testar cada tela manualmente antes de ativar.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );
  // Webhook do Stripe — PRECISA vir antes do express.json() global,
  // porque a verificação de assinatura do Stripe exige o corpo da
  // requisição em bytes crus (não já convertido pra objeto JS). Só esta
  // rota usa express.raw(); todas as outras continuam usando o parser
  // JSON normal, configurado logo abaixo.
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["stripe-signature"];
      const webhookSecret = getStripeWebhookSecret();
      const stripe = getStripe();
      if (!stripe || !webhookSecret || typeof signature !== "string") {
        console.error("[Stripe webhook] Recebido, mas o Stripe não está configurado neste servidor.");
        res.status(400).send("Stripe não configurado.");
        return;
      }

      let event: import("stripe").default.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      } catch (error) {
        console.error("[Stripe webhook] Assinatura inválida:", error instanceof Error ? error.message : error);
        res.status(400).send("Assinatura inválida.");
        return;
      }

      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object;
        const pendingSignupId = session.client_reference_id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

        if (pendingSignupId && subscriptionId && customerId && session.payment_status === "paid") {
          try {
            // Idempotente de propósito (ver finalizePaidSignup) — se a
            // página de "pagamento concluído" no navegador já tiver
            // finalizado isso antes do webhook chegar, essa chamada
            // simplesmente não faz nada (devolve null), sem erro.
            await finalizePaidSignup(pendingSignupId, {
              checkoutSessionId: session.id,
              customerId,
              subscriptionId,
              subscriptionStatus: "active",
            });
          } catch (error) {
            console.error("[Stripe webhook] Falha ao finalizar cadastro pago:", error);
            // Responde 500 de propósito — assim o Stripe tenta reenviar
            // este mesmo webhook depois, em vez de desistir achando que
            // já deu certo.
            res.status(500).send("Falha ao processar.");
            return;
          }
        }
      }

      res.json({ received: true });
    }
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Endpoint para disparar a checagem de treinamentos vencendo/vencidos por
  // um agendador externo (GitHub Actions, cron-job.org, etc.), já que o
  // Railway Cron reexecutaria o comando de start inteiro deste serviço (que
  // nunca termina) em vez de só essa tarefa pontual. Protegido por um
  // segredo compartilhado (CRON_SECRET), não pela sessão de admin do site.
  app.post("/api/cron/training-alerts", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers["x-cron-secret"];

    if (!secret) {
      return res.status(500).json({ error: "CRON_SECRET não configurado no servidor." });
    }
    if (typeof provided !== "string" || !timingSafeStringEqual(provided, secret)) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    try {
      const sent = await sendTrainingAlerts();
      return res.status(200).json({ success: true, sent });
    } catch (error) {
      console.error("[Cron] Erro ao enviar alertas de treinamento:", error);
      return res.status(500).json({ error: "Falha ao processar alertas" });
    }
  });

  // Backup do banco de dados — mesmo padrão do endpoint acima (o plano do
  // Railway usado aqui não inclui backup nativo). Rodar 1x/dia é
  // suficiente; configure isso no agendador externo escolhido.
  app.post("/api/cron/db-backup", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers["x-cron-secret"];

    if (!secret) {
      return res.status(500).json({ error: "CRON_SECRET não configurado no servidor." });
    }
    if (typeof provided !== "string" || !timingSafeStringEqual(provided, secret)) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const result = await runDatabaseBackup();
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    return res.status(200).json(result);
  });

  app.post("/api/seed/employees", (_req, res) => {
    res.status(410).json({ error: "Esta operação não está disponível." });
  });

  // TEMP DIAGNOSTIC — Gilvando contesta com razão: o programa de
  // sincronização mostra arquivos numa pasta que eu disse estar vazia, e
  // a barra de espaço usado do site mostra consumo. Verificando direto.
  app.get("/api/temp-cloud-diag2", async (req, res) => {
    const secret = "8mZ4vQeYnH2xKpR9tLbW7cJd3sNaXoV6";
    const provided = req.query.secret;
    if (typeof provided !== "string" || !timingSafeStringEqual(provided, secret)) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const namePart = typeof req.query.name === "string" ? req.query.name : "Ademilson";
    try {
      const { getCloudDiagByName } = await import("../db-cloud");
      const data = await getCloudDiagByName(namePart);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // TEMP DIAGNOSTIC — Gilvando confirmou direto no painel da Cloudflare
  // que os arquivos ESTÃO no R2. Comparando agora: o que o R2 tem de
  // verdade (prefixo do contrato) x o que o banco (cloudFiles.r2Key)
  // registra — se o R2 tiver MAIS objetos do que o banco conhece, a
  // etapa que falhou foi o registro final no banco (/complete), não o
  // envio em si.
  app.get("/api/temp-cloud-diag3", async (req, res) => {
    const secret = "Fj9RtY2mWpQ6zXbN4cLdK8vHaSoE1uGr";
    const provided = req.query.secret;
    if (typeof provided !== "string" || !timingSafeStringEqual(provided, secret)) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    const contractSlug = typeof req.query.contract === "string" ? req.query.contract : "integridade-estrutural";
    try {
      const { compareR2WithDb } = await import("../db-cloud");
      const data = await compareR2WithDb(contractSlug);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Upload do instalador do programa de sincronização com a Nuvem
  // (Windows) — em PARTES (multipart), não numa requisição só: a Railway
  // tem um limite rígido de 5 minutos por requisição HTTP, sem exceção, e
  // o instalador passa de 80MB — numa conexão mais lenta, uma única
  // requisição podia passar desse limite e travar sem erro claro (achado
  // real, 03/09). Dividido em pedaços de poucos MB cada, cada requisição
  // fica bem dentro do limite, não importa a velocidade da conexão.
  //
  // Fora do tRPC de propósito, mesma razão de sempre: corpo bruto
  // (application/octet-stream) por pedaço, sem base64 (que infla ~33% o
  // tamanho). Só o administrador principal pode enviar.

  // uploadId -> dados do envio em andamento — pra confirmar, na hora de
  // enviar cada parte ou finalizar, que é o mesmo envio que foi iniciado
  // (evita mistura entre dois envios ao mesmo tempo, embora isso não
  // deva acontecer na prática de um sistema pequeno como este).
  const activeMultipartUploads = new Map();
  const MULTIPART_UPLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 horas

  setInterval(() => {
    const now = Date.now();
    for (const [uploadId, info] of Array.from(activeMultipartUploads.entries())) {
      if (now - info.startedAt > MULTIPART_UPLOAD_TIMEOUT_MS) {
        activeMultipartUploads.delete(uploadId);
        abortMultipartUpload(info.r2Key, uploadId);
      }
    }
  }, 30 * 60 * 1000).unref();

  async function requireMasterAdminForInstaller(req: express.Request, res: express.Response) {
    const ctx = await createContext({ req, res } as Parameters<typeof createContext>[0]);
    if (!ctx.isSiteAdmin || ctx.siteRole !== "admin" || ctx.siteOrganizationId !== null) {
      res.status(403).json({ error: "Apenas o administrador principal pode enviar o instalador." });
      return null;
    }
    return { username: ctx.siteAdminUsername };
  }

  app.post("/api/desktop-installer/upload/start", csrfProtection, async (req, res) => {
    const session = await requireMasterAdminForInstaller(req, res);
    if (!session) return;

    const version = typeof req.body?.version === "string" ? req.body.version.trim() : "";
    const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
    if (!/^\d+\.\d+\.\d+$/.test(version) || !fileName.toLowerCase().endsWith(".exe") || /[/\\]/.test(fileName)) {
      return res.status(400).json({ error: "Informe a versão e o nome do arquivo." });
    }
    if (!isR2Configured) {
      return res.status(400).json({ error: "Armazenamento em nuvem (R2) não configurado no servidor." });
    }

    try {
      const r2Key = `_system/desktop-installer/${uuidv4()}-${fileName}`;
      const uploadId = await createMultipartUpload(r2Key, "application/x-msdownload");
      activeMultipartUploads.set(uploadId, {
        r2Key,
        version,
        fileName,
        startedBy: session.username ?? "desconhecido",
        startedAt: Date.now(),
      });
      return res.status(200).json({ uploadId, r2Key });
    } catch (error) {
      console.error("[DesktopInstaller] Erro ao iniciar envio em partes:", error);
      return res.status(500).json({ error: "Falha ao iniciar o envio." });
    }
  });

  app.post(
    "/api/desktop-installer/upload/part",
    csrfProtection,
    express.raw({ limit: "20mb", type: "application/octet-stream" }),
    async (req, res) => {
      const session = await requireMasterAdminForInstaller(req, res);
      if (!session) return;

      const uploadId = typeof req.query.uploadId === "string" ? req.query.uploadId : "";
      const partNumber = Number(req.query.partNumber);
      const info = activeMultipartUploads.get(uploadId);
      if (!info || info.startedBy !== session.username) {
        return res.status(400).json({ error: "Envio não encontrado (pode ter expirado) — comece de novo." });
      }
      if (!Number.isInteger(partNumber) || partNumber < 1) {
        return res.status(400).json({ error: "Número de parte inválido." });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "Parte vazia ou não recebida." });
      }

      try {
        const etag = await uploadPartToR2(info.r2Key, uploadId, partNumber, req.body);
        return res.status(200).json({ etag });
      } catch (error) {
        console.error("[DesktopInstaller] Erro ao enviar parte:", error);
        return res.status(500).json({ error: "Falha ao enviar essa parte — tente de novo." });
      }
    }
  );

  app.post("/api/desktop-installer/upload/complete", csrfProtection, async (req, res) => {
    const session = await requireMasterAdminForInstaller(req, res);
    if (!session) return;

    const uploadId = typeof req.body?.uploadId === "string" ? req.body.uploadId : "";
    const parts = Array.isArray(req.body?.parts) ? req.body.parts : null;
    const info = activeMultipartUploads.get(uploadId);
    if (!info || info.startedBy !== session.username) {
      return res.status(400).json({ error: "Envio não encontrado (pode ter expirado) — comece de novo." });
    }
    if (!parts || parts.length === 0) {
      return res.status(400).json({ error: "Nenhuma parte enviada." });
    }

    try {
      const previous = await getCurrentInstaller();
      await completeMultipartUpload(info.r2Key, uploadId, parts);
      const response = await fetch(await getR2DownloadUrl(info.r2Key, info.fileName), { signal: AbortSignal.timeout(240000) });
      if (!response.ok || !response.body) throw new Error('Não foi possível verificar o instalador.');
      const digest = createHash('sha512');
      let fileSize = 0;
      for await (const chunk of response.body as any) { digest.update(chunk); fileSize += chunk.length; }
      if (!fileSize) throw new Error('Instalador vazio.');
      const sha512 = digest.digest('base64');
      await setCurrentInstaller({
        sha512,
        r2Key: info.r2Key,
        fileName: info.fileName,
        version: info.version,
        fileSize,
        uploadedBy: info.startedBy,
      });
      activeMultipartUploads.delete(uploadId);
      if (previous) {
        await deleteFromR2(previous.r2Key);
      }
      return res.status(200).json({ success: true, version: info.version, fileSize });
    } catch (error) {
      console.error("[DesktopInstaller] Erro ao concluir envio:", error);
      return res.status(500).json({ error: "Falha ao concluir o envio." });
    }
  });

  // Upload de arquivo da Nuvem em PARTES — antes ia tudo numa única
  // requisição, com o arquivo inteiro convertido pra Base64 (~33% maior)
  // e guardado em memória várias vezes ao mesmo tempo (string JSON,
  // Buffer, SDK do S3). Um arquivo de 200MB podia consumir bem mais que
  // isso de memória de pico, com risco real de derrubar o container do
  // Railway (achado de auditoria de segurança, 07/09). Mesmo mecanismo de
  // partes já usado pro instalador do programa de sincronização acima —
  // reaproveita o mesmo activeMultipartUploads e a mesma limpeza por
  // tempo esgotado.
  registerDesktopUpdateRoutes(app);
  registerCloudUploadRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    csrfProtection,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // Start email service for training alerts (check every 24 hours)
    // Os alertas de treinamento agora são disparados pelo agendador externo
    // (GitHub Actions -> POST /api/cron/training-alerts), que é confiável mesmo
    // se o serviço reiniciar. O agendamento dentro do processo foi removido:
    // ele reenviava tudo a cada deploy e concorria com as primeiras
    // requisições dos usuários na subida do servidor, deixando a tela de login
    // lenta logo após cada publicação.
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});



