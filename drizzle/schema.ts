import { boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, date } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Employees table for training management system
 */
export const employees = mysqlTable("employees", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  registration: varchar("registration", { length: 50 }),
  educationLevel: varchar("educationLevel", { length: 100 }),
  age: int("age"),
  birthDate: varchar("birthDate", { length: 10 }),
  role: varchar("role", { length: 255 }).default("").notNull(),
  phone: varchar("phone", { length: 20 }),
  // JSON com os valores dos campos personalizados do contrato (ver
  // contractCustomFields) — {fieldKey: valor}.
  customFields: text("customFields"),
  // Contrato ao qual o colaborador pertence (ver shared/contracts.ts)
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  // Demissão: o colaborador sai das listas e das contagens, mas o registro e
  // os treinamentos ficam guardados (diferente de excluir).
  dismissed: boolean("dismissed").default(false).notNull(),
  dismissedAt: timestamp("dismissedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/**
 * Trainings table for employee training records
 */
export const trainings = mysqlTable("trainings", {
  id: varchar("id", { length: 64 }).primaryKey(),
  employeeId: varchar("employeeId", { length: 64 })
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  completionDate: varchar("completionDate", { length: 10 }).notNull(),
  expirationDate: varchar("expirationDate", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Training = typeof trainings.$inferSelect;
export type InsertTraining = typeof trainings.$inferInsert;

/**
 * Audit log table for tracking modifications
 */
export const auditLogs = mysqlTable("auditLogs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  employeeId: varchar("employeeId", { length: 64 })
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 50 }).notNull(),
  changes: text("changes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * Certificates table for storing certificate uploads
 */
export const certificates = mysqlTable("certificates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  trainingId: varchar("trainingId", { length: 64 })
    .notNull()
    .references(() => trainings.id, { onDelete: "cascade" }),
  employeeId: varchar("employeeId", { length: 64 })
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Certificate = typeof certificates.$inferSelect;
export type InsertCertificate = typeof certificates.$inferInsert;

/**
 * Email notification tracking table
 */
export const emailNotifications = mysqlTable("emailNotifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  trainingId: varchar("trainingId", { length: 64 })
    .notNull()
    .references(() => trainings.id, { onDelete: "cascade" }),
  employeeId: varchar("employeeId", { length: 64 })
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  lastSentAt: timestamp("lastSentAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailNotification = typeof emailNotifications.$inferSelect;
export type InsertEmailNotification = typeof emailNotifications.$inferInsert;

/**
 * Contas de administrador do site (login nomeado, substitui gradualmente a
 * senha única compartilhada).
 */
export const admins = mysqlTable("admins", {
  id: varchar("id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  // "admin" = administrador principal (tudo liberado, gerencia contas)
  // "user"  = usuário comum, limitado ao que estiver em permissions
  role: varchar("role", { length: 20 }).notNull().default("user"),
  // Contrato do usuário: ele só enxerga dados deste contrato
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  // JSON com as permissões concedidas a usuários comuns
  permissions: text("permissions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = typeof admins.$inferInsert;

/**
 * Rastro de atividades: quem fez o quê no site.
 * Separado de auditLogs (que registra alterações de um colaborador específico
 * sem identificar o autor) — aqui o foco é a pessoa que executou a ação.
 */
export const activityLogs = mysqlTable("activityLogs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 100 }).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  targetType: varchar("targetType", { length: 40 }),
  targetId: varchar("targetId", { length: 64 }),
  targetName: varchar("targetName", { length: 255 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

/**
 * FDS — Ficha de Dados de Segurança.
 * O PDF fica no Supabase; `roles` guarda em JSON as funções que utilizam a
 * ficha, para o colaborador ver apenas as FDS da função dele.
 */
export const safetySheets = mysqlTable("safetySheets", {
  id: varchar("id", { length: 64 }).primaryKey(),
  // Tipo do documento: fds, ara, checklist, ltcat, pgr, pos
  // (ver shared/document-types.ts). Registros antigos ficam como "fds".
  type: varchar("type", { length: 20 }).default("fds").notNull(),
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: int("fileSize"),
  roles: text("roles"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SafetySheet = typeof safetySheets.$inferSelect;
export type InsertSafetySheet = typeof safetySheets.$inferInsert;

/**
 * Contratos atendidos pelo sistema. Antes era uma lista fixa no código; agora
 * o administrador cadastra, edita e exclui pela própria interface.
 */
export const contracts = mysqlTable("contracts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  // Identificador estável usado em employees/admins/safetySheets.contract.
  // Não muda depois de criado, mesmo que o nome seja editado.
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  // "do" ou "da" — para o título "Gestão de Controle do Contrato ___ Nome"
  preposition: varchar("preposition", { length: 2 }).notNull().default("do"),
  // E-mail que recebe os alertas de treinamento deste contrato; vazio usa o
  // endereço global (ALERT_RECIPIENT_EMAIL).
  alertEmail: varchar("alertEmail", { length: 255 }),
  // Telefone (com DDD e código do país, ex: 5511999999999) que recebe os
  // alertas por WhatsApp deste contrato; vazio = não envia por WhatsApp.
  alertWhatsapp: varchar("alertWhatsapp", { length: 20 }),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContractRow = typeof contracts.$inferSelect;
export type InsertContractRow = typeof contracts.$inferInsert;

/**
 * Campos personalizados por contrato. Cada contrato pode definir campos
 * extras próprios (ex: "Matrícula do cliente", "Categoria da CNH") que
 * aparecem no cadastro de colaborador só daquele contrato.
 */
export const contractCustomFields = mysqlTable("contractCustomFields", {
  id: varchar("id", { length: 64 }).primaryKey(),
  // Referencia contracts.slug (não o id) — mesma convenção usada em
  // employees/admins/safetySheets.contract.
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  // Identificador estável usado como chave no JSON de employees.customFields.
  fieldKey: varchar("fieldKey", { length: 60 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  fieldType: varchar("fieldType", { length: 20 }).notNull().default("text"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContractCustomFieldRow = typeof contractCustomFields.$inferSelect;

/**
 * Nuvem de arquivos por contrato — pastas e arquivos, no estilo SharePoint.
 * O acesso é controlado pelas permissões viewCloud/manageCloud (pessoa por
 * pessoa, na tela de Usuários), não é liberado automaticamente por contrato.
 */
export const cloudFolders = mysqlTable("cloudFolders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  // null = pasta na raiz do contrato
  parentId: varchar("parentId", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: varchar("createdBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const cloudFiles = mysqlTable("cloudFiles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  // null = arquivo na raiz do contrato (fora de qualquer pasta)
  folderId: varchar("folderId", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  uploadedBy: varchar("uploadedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CloudFolderRow = typeof cloudFolders.$inferSelect;
export type CloudFileRow = typeof cloudFiles.$inferSelect;

/**
 * Notas Fiscais e recibos — separadas por contrato, com anexo opcional
 * (mesmo bucket do Supabase usado por certificados/documentos).
 */
export const invoices = mysqlTable("invoices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  docType: mysqlEnum("docType", ["nota_fiscal", "recibo"]).default("nota_fiscal").notNull(),
  number: varchar("number", { length: 100 }),
  supplier: varchar("supplier", { length: 255 }),
  cnpj: varchar("cnpj", { length: 20 }),
  issueDate: varchar("issueDate", { length: 10 }).notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).notNull(),
  taxes: decimal("taxes", { precision: 12, scale: 2 }).default("0"),
  // Itens/produtos da nota, guardados como JSON: [{name, qty, unit_price, total}]
  products: text("products"),
  category: varchar("category", { length: 120 }),
  costCenter: varchar("costCenter", { length: 120 }),
  paymentMethod: mysqlEnum("paymentMethod", [
    "dinheiro",
    "pix",
    "cartao_credito",
    "cartao_debito",
    "boleto",
    "transferencia",
    "outro",
  ]),
  description: text("description"),
  fileName: varchar("fileName", { length: 255 }),
  fileUrl: text("fileUrl"),
  fileSize: int("fileSize"),
  status: mysqlEnum("status", ["pendente", "processado", "confirmado"]).default("processado").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Categorias de nota fiscal — compartilhadas entre contratos (mesma lista
 * para todos). `isDefault` marca as criadas automaticamente na migração,
 * que não podem ser excluídas.
 */
export const invoiceCategories = mysqlTable("invoiceCategories", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  color: varchar("color", { length: 20 }).default("#3b82f6").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvoiceCategoryRow = typeof invoiceCategories.$inferSelect;
export type InsertInvoiceCategoryRow = typeof invoiceCategories.$inferInsert;

/**
 * Configurações do módulo de notas fiscais por contrato — hoje só o limite
 * de gastos mensais usado na tela de Alertas.
 */
export const invoiceSettings = mysqlTable("invoiceSettings", {
  contract: varchar("contract", { length: 40 }).primaryKey(),
  monthlyLimit: decimal("monthlyLimit", { precision: 12, scale: 2 }).default("5000"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InvoiceSettingsRow = typeof invoiceSettings.$inferSelect;
export type InsertInvoiceSettingsRow = typeof invoiceSettings.$inferInsert;
