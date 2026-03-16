import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { scheduleTrainingAlerts } from "../email-service";
import { nanoid } from "nanoid";

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
  
  // Initialize database connection early
  const { getDb } = await import("../db");
  try {
    await getDb();
    console.log("[Server] Database connected successfully");
  } catch (error) {
    console.warn("[Server] Database connection warning:", error);
  }
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // Seed route for bulk employee insertion
  app.post("/api/seed/employees", async (req, res) => {
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
  
  // tRPC API
  app.use(
    "/api/trpc",
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
    scheduleTrainingAlerts(1440);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
