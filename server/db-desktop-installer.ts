/**
 * Metadados do instalador atual do programa de sincronização com a Nuvem
 * (Windows). O arquivo em si fica no Cloudflare R2 — aqui só o "endereço"
 * (r2Key) e informação pra mostrar na tela.
 */

import { desktopInstaller, type DesktopInstallerRow } from "../drizzle/schema";
import { getDb } from "./db";

export async function getCurrentInstaller(): Promise<DesktopInstallerRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(desktopInstaller).limit(1);
  return rows[0] ?? null;
}

export async function setCurrentInstaller(input: {
  sha512?: string;
  r2Key: string;
  fileName: string;
  version: string;
  fileSize: number;
  uploadedBy: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Banco de dados não disponível.");
  }
  // Só existe uma linha por vez — apaga a anterior (se houver) e insere a
  // nova. Sem transação de propósito (não sei se o driver configurado
  // aqui suporta) — o risco de uma leitura pegar "nenhum instalador" no
  // meio dos dois passos é insignificante, já que isso só acontece
  // quando um administrador envia uma versão nova manualmente, uma vez
  // a cada muito tempo.
  await db.transaction(async tx => {
    await tx.delete(desktopInstaller);
    await tx.insert(desktopInstaller).values(input);
  });
}
