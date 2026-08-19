/**
 * Migração única dos dados do almoxarifado antigo (Supabase) para o banco
 * deste sistema. Roda no servidor (Railway), que tem acesso à internet —
 * diferente do ambiente de desenvolvimento, que não alcança o Supabase.
 *
 * Não migra employees/user_permissions do sistema antigo: usa os
 * colaboradores que já existem aqui, casando por nome.
 */

import { v4 as uuidv4 } from "uuid";
import {
  createWarehouseItem,
  createWarehouseMovement,
  listWarehouseItems,
} from "./db-warehouse";
import { getAllEmployees } from "./db-employees";
import { getDb } from "./db";
import { toolDeliveries, purchaseRequests, warehouseMovements } from "../drizzle/schema";
import type { WarehouseItemType } from "@shared/warehouse";

interface SupabaseCreds {
  url: string;
  serviceKey: string;
}

async function supabaseSelect<T = any>(creds: SupabaseCreds, table: string): Promise<T[]> {
  const res = await fetch(`${creds.url}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: creds.serviceKey,
      Authorization: `Bearer ${creds.serviceKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Falha ao ler "${table}" do Supabase: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export interface MigrationResult {
  items: number;
  movements: number;
  deliveries: number;
  purchaseRequests: number;
  warnings: string[];
}

const VALID_ITEM_TYPES: WarehouseItemType[] = [
  "epi",
  "ferramenta",
  "equipamento",
  "material_consumo",
  "material_limpeza",
  "gas",
  "material",
];

export async function migrateWarehouseFromSupabase(
  creds: SupabaseCreds,
  contract: string
): Promise<MigrationResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const warnings: string[] = [];

  // Evita duplicar se essa migração já rodou antes para este contrato.
  const existing = await listWarehouseItems(contract);
  if (existing.length > 0) {
    throw new Error(
      `Este contrato já tem ${existing.length} item(ns) cadastrado(s) no almoxarifado. ` +
        `Para evitar duplicar, a migração não roda de novo automaticamente — apague os itens existentes primeiro se quiser migrar de novo.`
    );
  }

  // 1) Itens
  const rawItems = await supabaseSelect(creds, "items");
  const itemIdMap = new Map<string, string>(); // id antigo (Supabase) -> id novo
  let itemsCount = 0;

  for (const raw of rawItems) {
    const newId = uuidv4();
    const type: WarehouseItemType = VALID_ITEM_TYPES.includes(raw.type) ? raw.type : "material";

    await createWarehouseItem(newId, contract, {
      code: String(raw.code ?? raw.id ?? newId).slice(0, 100),
      name: String(raw.name ?? "Sem nome"),
      type,
      unit: raw.unit || "un",
      quantity: Number(raw.quantity) || 0,
      ca: raw.ca || null,
      dataValidadeCa: raw.data_validade_ca || null,
      patrimonio: raw.patrimonio || null,
      estoqueMinimo: Number(raw.estoque_minimo) || 10,
      localizacao: raw.localizacao || null,
      fornecedor: raw.fornecedor || null,
      precoUnitario: Number(raw.unit_price ?? raw.preco_unitario) || 0,
      dataValidade: raw.data_validade || null,
    });

    if (raw.id) itemIdMap.set(String(raw.id), newId);
    itemsCount++;
  }

  // 2) Movimentações (entrada/saída) — insere direto, sem reajustar estoque
  // (o estoque migrado no item já reflete o saldo atual, mexer de novo
  // duplicaria o efeito).
  const rawMovements = await supabaseSelect(creds, "stock_movements");
  let movementsCount = 0;

  for (const raw of rawMovements) {
    const newItemId = raw.item_id ? itemIdMap.get(String(raw.item_id)) : undefined;
    const movementType = raw.movement_type === "entrada" ? "entrada" : "saida";

    await db.insert(warehouseMovements).values({
      id: uuidv4(),
      contract,
      itemId: newItemId ?? null,
      itemCode: String(raw.item_code ?? ""),
      itemName: String(raw.item_name ?? "Item removido"),
      movementType,
      quantity: String(Number(raw.quantity) || 0),
      date: raw.date ? new Date(raw.date) : raw.created_at ? new Date(raw.created_at) : new Date(),
      destination: raw.reason || null,
      responsible: raw.requisitante || null,
      invoiceNumber: raw.nota_fiscal || null,
      purchaseOrder: raw.pedido_compra || null,
      supplier: raw.fornecedor || null,
      unitPrice: raw.valor_unitario != null ? String(raw.valor_unitario) : null,
      notes: raw.notes || null,
    });
    movementsCount++;
  }

  // 3) Entregas/devoluções de ferramentas — casa colaborador pelo NOME, já
  // que o id antigo não existe neste sistema (usa os employees já cadastrados).
  const employees = await getAllEmployees(contract);
  const employeeByName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e]));

  const rawDeliveries = await supabaseSelect(creds, "tool_deliveries");
  let deliveriesCount = 0;
  const unmatchedEmployees = new Set<string>();

  for (const raw of rawDeliveries) {
    const rawName = String(raw.employee_name ?? "").trim();
    const employee = employeeByName.get(rawName.toLowerCase());
    if (!employee) {
      unmatchedEmployees.add(rawName || "(sem nome)");
      continue;
    }

    const newItemId = raw.item_id ? itemIdMap.get(String(raw.item_id)) : undefined;

    await db.insert(toolDeliveries).values({
      id: uuidv4(),
      contract,
      employeeId: employee.id,
      employeeName: employee.name,
      itemId: newItemId ?? "",
      itemCode: String(raw.item_code ?? ""),
      itemName: String(raw.item_name ?? "Item removido"),
      quantity: String(Number(raw.quantity) || 1),
      status: raw.status === "devolvido" ? "devolvido" : "entregue",
      obs: raw.obs || null,
      returnObs: raw.return_obs || null,
      deliveredBy: raw.delivered_by || null,
      deliveredAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      returnedAt: raw.returned_at ? new Date(raw.returned_at) : null,
    });
    deliveriesCount++;
  }

  if (unmatchedEmployees.size > 0) {
    warnings.push(
      `${unmatchedEmployees.size} entrega(s) não migrada(s) por não encontrar o colaborador pelo nome: ` +
        Array.from(unmatchedEmployees).slice(0, 10).join(", ") +
        (unmatchedEmployees.size > 10 ? "..." : "")
    );
  }

  // 4) Solicitações de compra
  const rawRequests = await supabaseSelect(creds, "purchase_requests");
  let requestsCount = 0;

  for (const raw of rawRequests) {
    let items: any[] = [];
    try {
      items = Array.isArray(raw.item_names) ? raw.item_names : JSON.parse(raw.item_names || "[]");
    } catch {
      items = [];
    }
    if (items.length === 0 && raw.item_name) {
      items = [{ name: raw.item_name, quantity: raw.quantity || 1, priority: raw.priority || "normal" }];
    }
    if (items.length === 0) continue;

    await db.insert(purchaseRequests).values({
      id: uuidv4(),
      contract,
      registro: String(raw.registro ?? `SC-MIG-${requestsCount + 1}`),
      items: JSON.stringify(items),
      priority: raw.priority || "normal",
      status: raw.status || "pendente",
      cancelReason: raw.cancel_reason || null,
      requestedBy: raw.requested_by || raw.created_by || null,
      createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
      expiresAt: raw.expires_at ? new Date(raw.expires_at) : null,
    });
    requestsCount++;
  }

  return {
    items: itemsCount,
    movements: movementsCount,
    deliveries: deliveriesCount,
    purchaseRequests: requestsCount,
    warnings,
  };
}
