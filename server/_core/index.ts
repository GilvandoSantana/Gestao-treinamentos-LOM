import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sendTrainingAlerts } from "../email-service";
import { nanoid } from "nanoid";
import { hasValidSiteSession, getSiteSession } from "../site-auth";
import { csrfProtection } from "./csrf";
import {
  deleteFromR2,
  isR2Configured,
  createMultipartUpload,
  uploadPartToR2,
  completeMultipartUpload,
  abortMultipartUpload,
} from "../r2-storage";
import { getCurrentInstaller, setCurrentInstaller } from "../db-desktop-installer";
import { getStripe, getStripeWebhookSecret } from "../stripe-client";
import { finalizePaidSignup } from "../db-organizations";
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

      if (event.type === "checkout.session.completed") {
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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
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
    if (provided !== secret) {
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

  // Seed route for bulk employee insertion
  // Protegida: só executa com uma sessão de admin do site válida (cookie
  // definido via auth.siteLogin). Antes era pública e qualquer um podia
  // chamá-la para inserir dados em massa sem senha.
  app.post("/api/seed/employees", async (req, res) => {
    const isSiteAdmin = await hasValidSiteSession(req);
    if (!isSiteAdmin) {
      return res.status(401).json({ error: "Não autorizado" });
    }
    try {
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }
      const { employees: employeeTable } = await import("../../drizzle/schema");
      
      const employeesList = [
        'Adryan Gabriel Alves',
        'Alexandre Francisco Souza Da Silva',
        'Alexandre Vinicius Santos',
        'Alexandro Souza Dos Santos',
        'Algary Feitosa Cavalcante',
        'Alison Valbert',
        'Amós Silvestre Dos Santos',
        'André Neres Santos',
        'Antônio Dizio Da Silva',
        'Antonio Marcos Alves De Souza',
        'Carlos Alberto Dos Santos',
        'Clebisson Dos Santos',
        'Cleisson Cardoso Dantas',
        'Cleverton De Andrade Santos',
        'David Lune Conceição',
        'Edidelson Santos',
        'Eraldo Pereira Santos',
        'Erivaldo Batista Santos Junior',
        'Esdras Phillip',
        'Everton Mendes Soares',
        'Francisco Cicero Da Silva',
        'Gabriel Dos Santos Costa',
        'Gabriel Santana Dos Santos',
        'Gabriel Santana Nogueira',
        'Helyel Santana Silva',
        'Humberto Rodrigues Dos Santos Neto',
        'Ivanilson Menezes Batista',
        'Izaias Da Paz Santos',
        'Jeizon Nunes Santos',
        'João Pedro Da Silva Santos',
        'Joelisson Dos Santos',
        'Jose Alisson De Lima Morais',
        'José Vanderley Francisco',
        'Josivan Da Silva Lima',
        'Luiz Carlos Maia Santos',
        'Magno Dos Santos',
        'Manoel Messias Dos Santos',
        'Marcelo Santos Santana',
        'Marcus Vinicius Gomes De Azevedo',
        'Mateus Souza Da Hora',
        'Matheus Santos Gomes',
        'Michael Alysson Jheckson Santos Silva',
        'Nathan Nascimento Santos',
        'Rafael Santos Bispo',
        'Robson Santos Da Silva',
        'Shairwandler Santos Santana',
        'Thiago Freire De Campos',
        'Walisson Tavares Dos Santos',
        'Welber Guilherme Dos Santos',
        'Wevicles Oliveira Batista Dos Santos',
        'Yago Santos Cruz'
      ];
      
      let inserted = 0;
      for (const name of employeesList) {
        try {
          await db.insert(employeeTable).values({
            id: nanoid(),
            name,
            role: ''
          });
          inserted++;
        } catch (error: any) {
          console.error(`[Seed] Error inserting ${name}:`, error.message);
        }
      }
      
      res.json({ success: true, inserted, total: employeesList.length });
    } catch (error: any) {
      console.error('[Seed] Error:', error);
      res.status(500).json({ error: error.message });
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
    const session = await getSiteSession(req);
    if (!session.isSiteAdmin || session.role !== "admin") {
      res.status(403).json({ error: "Apenas o administrador principal pode enviar o instalador." });
      return null;
    }
    return session;
  }

  app.post("/api/desktop-installer/upload/start", csrfProtection, async (req, res) => {
    const session = await requireMasterAdminForInstaller(req, res);
    if (!session) return;

    const version = typeof req.body?.version === "string" ? req.body.version.trim() : "";
    const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
    if (!version || !fileName) {
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
      if (!info) {
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
    if (!info) {
      return res.status(400).json({ error: "Envio não encontrado (pode ter expirado) — comece de novo." });
    }
    if (!parts || parts.length === 0) {
      return res.status(400).json({ error: "Nenhuma parte enviada." });
    }

    try {
      const previous = await getCurrentInstaller();
      await completeMultipartUpload(info.r2Key, uploadId, parts);
      const fileSize = req.body?.fileSize && Number.isFinite(req.body.fileSize) ? req.body.fileSize : 0;
      await setCurrentInstaller({
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
