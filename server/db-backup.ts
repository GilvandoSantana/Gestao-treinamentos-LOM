/**
 * Backup do banco de dados — o plano do Railway usado aqui não inclui
 * backup automático nativo (confirmado com o Gilvando), então isso roda
 * por conta própria: gera um dump SQL completo e guarda no mesmo
 * Cloudflare R2 já usado pra Nuvem, numa pasta separada
 * ("system-backups/"). Usa a biblioteca "mysqldump" (JavaScript puro —
 * não depende do programa mysqldump instalado no servidor, que
 * provavelmente não existe no container do Railway).
 *
 * Disparado por um agendador EXTERNO (GitHub Actions, cron-job.org),
 * batendo em /api/cron/db-backup — mesmo padrão já usado pros alertas de
 * treinamento (ver comentário completo em server/_core/index.ts, rota
 * /api/cron/training-alerts). NÃO usa setInterval interno: o servidor
 * reinicia com frequência (a cada deploy), e um agendador embutido no
 * processo perderia o ritmo ou nunca chegaria a rodar.
 *
 * Retenção simples: mantém só os últimos N backups, apaga o resto
 * automaticamente — sem isso, o espaço usado cresceria pra sempre.
 */

import mysqldump from "mysqldump";
import { uploadToR2, deleteFromR2, listObjectsInR2, isR2Configured } from "./r2-storage";

const BACKUP_PREFIX = "system-backups/";
const RETENTION_COUNT = 14; // mantém os últimos 14 backups (2 semanas, se rodar 1x/dia)

function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

export interface BackupResult {
  success: boolean;
  key?: string;
  sizeBytes?: number;
  error?: string;
}

export async function runDatabaseBackup(): Promise<BackupResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { success: false, error: "DATABASE_URL não configurado." };
  }
  if (!isR2Configured) {
    return { success: false, error: "Cloudflare R2 não configurado — não há onde guardar o backup." };
  }

  try {
    const connection = parseDatabaseUrl(databaseUrl);
    const result = await mysqldump({ connection });
    const sqlContent = [result.dump.schema, result.dump.data].filter(Boolean).join("\n\n");
    const buffer = Buffer.from(sqlContent, "utf-8");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `${BACKUP_PREFIX}backup-${timestamp}.sql`;

    await uploadToR2(key, buffer, "application/sql");
    await pruneOldBackups();

    console.log(`[Backup] Concluído: ${key} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    return { success: true, key, sizeBytes: buffer.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Backup] Falha ao gerar backup:", error);
    return { success: false, error: message };
  }
}

async function pruneOldBackups(): Promise<void> {
  const backups = await listObjectsInR2(BACKUP_PREFIX);
  // O nome do arquivo já embute a data em formato ISO (ordena
  // cronologicamente só comparando o texto, sem precisar parsear nada).
  const sorted = [...backups].sort((a, b) => a.key.localeCompare(b.key));
  const toDelete = sorted.slice(0, Math.max(0, sorted.length - RETENTION_COUNT));
  for (const item of toDelete) {
    await deleteFromR2(item.key);
  }
  if (toDelete.length > 0) {
    console.log(`[Backup] ${toDelete.length} backup(s) antigo(s) removido(s) (retenção: ${RETENTION_COUNT}).`);
  }
}

export async function listBackups() {
  if (!isR2Configured) return [];
  const backups = await listObjectsInR2(BACKUP_PREFIX);
  return backups.sort((a, b) => b.key.localeCompare(a.key)); // mais recente primeiro
}
