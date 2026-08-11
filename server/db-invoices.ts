/**
 * Database helpers para Notas Fiscais e Recibos.
 */

import { desc, eq } from "drizzle-orm";
import { invoices, type Invoice } from "../drizzle/schema";
import { getDb } from "./db";
import { DEFAULT_CONTRACT_SLUG } from "@shared/contracts";
import {
  type InvoiceDocType,
  type InvoiceStatus,
  type InvoicePaymentMethod,
  type InvoiceProduct,
  isInvoiceDocType,
  isInvoiceStatus,
} from "@shared/invoices";

export type PublicInvoice = {
  id: string;
  contract: string;
  docType: InvoiceDocType;
  number: string | null;
  supplier: string | null;
  cnpj: string | null;
  issueDate: string;
  value: number;
  taxes: number;
  products: InvoiceProduct[];
  category: string | null;
  costCenter: string | null;
  paymentMethod: InvoicePaymentMethod | null;
  description: string | null;
  fileName: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(row: Invoice): PublicInvoice {
  let products: InvoiceProduct[] = [];
  if (row.products) {
    try {
      const parsed = JSON.parse(row.products);
      if (Array.isArray(parsed)) products = parsed;
    } catch {
      products = [];
    }
  }
  return {
    id: row.id,
    contract: row.contract || DEFAULT_CONTRACT_SLUG,
    docType: isInvoiceDocType(row.docType) ? row.docType : "nota_fiscal",
    number: row.number ?? null,
    supplier: row.supplier ?? null,
    cnpj: row.cnpj ?? null,
    issueDate: row.issueDate,
    value: Number(row.value ?? 0),
    taxes: Number(row.taxes ?? 0),
    products,
    category: row.category ?? null,
    costCenter: row.costCenter ?? null,
    paymentMethod: (row.paymentMethod as InvoicePaymentMethod | null) ?? null,
    description: row.description ?? null,
    fileName: row.fileName ?? null,
    fileUrl: row.fileUrl ?? null,
    fileSize: row.fileSize ?? null,
    status: isInvoiceStatus(row.status) ? row.status : "processado",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listInvoices(contract?: string): Promise<PublicInvoice[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = contract
      ? await db.select().from(invoices).where(eq(invoices.contract, contract)).orderBy(desc(invoices.issueDate))
      : await db.select().from(invoices).orderBy(desc(invoices.issueDate));
    return rows.map(toPublic);
  } catch (error) {
    console.error("[Invoices] Falha ao listar notas fiscais:", error);
    return [];
  }
}

export async function getInvoiceById(id: string): Promise<PublicInvoice | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(invoices).where(eq(invoices.id, id));
  return rows[0] ? toPublic(rows[0]) : undefined;
}

export async function createInvoice(input: {
  id: string;
  contract: string;
  docType: InvoiceDocType;
  number?: string;
  supplier?: string;
  cnpj?: string;
  issueDate: string;
  value: number;
  taxes?: number;
  products?: InvoiceProduct[];
  category?: string;
  costCenter?: string;
  paymentMethod?: InvoicePaymentMethod;
  description?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  status?: InvoiceStatus;
}): Promise<PublicInvoice> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(invoices).values({
    id: input.id,
    contract: input.contract,
    docType: input.docType,
    number: input.number,
    supplier: input.supplier,
    cnpj: input.cnpj,
    issueDate: input.issueDate,
    value: String(input.value),
    taxes: String(input.taxes ?? 0),
    products: input.products ? JSON.stringify(input.products) : undefined,
    category: input.category,
    costCenter: input.costCenter,
    paymentMethod: input.paymentMethod,
    description: input.description,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    fileSize: input.fileSize,
    status: input.status ?? "processado",
  });

  const created = await getInvoiceById(input.id);
  if (!created) throw new Error("Falha ao criar nota fiscal");
  return created;
}

export async function updateInvoice(
  id: string,
  input: Partial<{
    docType: InvoiceDocType;
    number: string;
    supplier: string;
    cnpj: string;
    issueDate: string;
    value: number;
    taxes: number;
    products: InvoiceProduct[];
    category: string;
    costCenter: string;
    paymentMethod: InvoicePaymentMethod;
    description: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    status: InvoiceStatus;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const set: Record<string, unknown> = { ...input };
  if (input.value !== undefined) set.value = String(input.value);
  if (input.taxes !== undefined) set.taxes = String(input.taxes);
  if (input.products !== undefined) set.products = JSON.stringify(input.products);

  await db.update(invoices).set(set).where(eq(invoices.id, id));
}

export async function deleteInvoice(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invoices).where(eq(invoices.id, id));
}

/** Move uma nota fiscal para outro contrato (uso exclusivo do administrador). */
export async function setInvoiceContract(id: string, contract: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set({ contract }).where(eq(invoices.id, id));
}
