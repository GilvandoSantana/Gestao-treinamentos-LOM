import { bigint, boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, date, uniqueIndex } from "drizzle-orm/mysql-core";

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
  // Data de admissão (formato YYYY-MM-DD) — usada na Ficha de EPI e em
  // outros documentos de admissão gerados automaticamente.
  admissionDate: varchar("admissionDate", { length: 10 }),
  // Líder e área do colaborador — usados no módulo de Lançamentos RQA's
  // (ideia do Gilvando, 16/09), pra agrupar o resultado por líder/área
  // como a planilha de Excel que ele usava fazia. Texto livre (sem lista
  // fixa) — a lista de opções que aparece na tela vem dos próprios
  // valores já usados por outros colaboradores do mesmo contrato, nunca
  // fica desatualizada por conta própria (era exatamente o problema da
  // planilha antiga).
  leader: varchar("leader", { length: 120 }),
  area: varchar("area", { length: 120 }),
  // Gerência/setor do colaborador (ex: "Engª Manutenção") — usado no crachá
  // padrão. Diferente do "Gestor do contrato" (1 nome só, por contrato).
  gerencia: varchar("gerencia", { length: 150 }),
  // Dados de CNH — usados no crachá padrão, quando o colaborador precisar
  // dirigir. Ficam em branco pra quem não tem/não se aplica.
  cnhNumero: varchar("cnhNumero", { length: 30 }),
  cnhValidade: varchar("cnhValidade", { length: 10 }),
  cnhCategoria: varchar("cnhCategoria", { length: 10 }),
  // CPF do colaborador — usado na Ordem de Serviço (Documentação).
  cpf: varchar("cpf", { length: 14 }),
  // JSON com os valores dos campos personalizados do contrato (ver
  // contractCustomFields) — {fieldKey: valor}.
  customFields: text("customFields"),
  // Contrato ao qual o colaborador pertence (ver shared/contracts.ts)
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  // Demissão: o colaborador sai das listas e das contagens, mas o registro e
  // os treinamentos ficam guardados (diferente de excluir).
  dismissed: boolean("dismissed").default(false).notNull(),
  dismissedAt: timestamp("dismissedAt"),
  // Hash do PIN de acesso ao portal de autoatendimento (nunca o PIN em
  // texto puro) — nulo até o colaborador fazer o primeiro acesso e
  // definir um PIN próprio (ver server/routers/employee-portal.ts).
  portalPinHash: varchar("portalPinHash", { length: 255 }),
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
  // Organização dona desta conta — ver comentário completo na tabela
  // organizations. Nullable por enquanto (mesma etapa gradual de
  // contracts.organizationId); toda linha já existente foi preenchida
  // automaticamente na migração que criou esta coluna.
  organizationId: varchar("organizationId", { length: 64 }),
  // Único POR ORGANIZAÇÃO (não mais globalmente) — antes de multi-empresa,
  // dois clientes diferentes nunca poderiam ter cada um um admin chamado
  // "joao", por exemplo. Hoje só existe uma organização, então o efeito
  // prático é idêntico ao de antes.
  username: varchar("username", { length: 100 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  // "admin" = administrador principal (tudo liberado, gerencia contas)
  // "user"  = usuário comum, limitado ao que estiver em permissions
  role: varchar("role", { length: 20 }).notNull().default("user"),
  // Contrato do usuário: ele só enxerga dados deste contrato
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  // Setor/departamento (ex: "RH", "Segurança") — usado pra grupos
  // automáticos da Nuvem: todo mundo do mesmo setor entra sozinho no grupo.
  setor: varchar("setor", { length: 100 }),
  // JSON com as permissões concedidas a usuários comuns
  permissions: text("permissions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Autenticação em duas etapas (TOTP, compatível com Google
  // Authenticator/Authy). Nulo = 2FA desativada (padrão). O segredo NUNCA
  // é devolvido pro cliente depois de confirmado uma vez — só usado no
  // servidor pra verificar o código de 6 dígitos a cada login.
  twoFactorSecret: varchar("twoFactorSecret", { length: 64 }),
  // JSON com hash (não texto puro) de cada código reserva — usados se a
  // pessoa perder acesso ao aplicativo autenticador. Cada código só serve
  // uma vez; usado é removido da lista.
  twoFactorBackupCodes: text("twoFactorBackupCodes"),
}, (table) => ({
  // Substitui o antigo UNIQUE(username) global — ver comentário no campo
  // username acima.
  orgUsernameUnique: uniqueIndex("admins_organizationId_username_unique").on(table.organizationId, table.username),
}));

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
 * Organização (empresa dona da conta no sistema) — camada de isolamento
 * multi-empresa, acima de "contrato". Um contrato pertence a uma
 * organização; hoje só existe uma (a empresa que já usa o sistema),
 * migrada automaticamente na criação desta tabela. Ainda não afeta login
 * nem nenhuma tela — é só a base de dados pra virar multi-empresa de
 * verdade nas próximas etapas (login por organização, cadastro público,
 * assinatura).
 *
 * IMPORTANTE: não confundir com `contracts.companyName` (razão social
 * impressa no cabeçalho da Ordem de Serviço) — são conceitos diferentes
 * que só coincidem de nome em português. Por isso "organization", não
 * "empresa", no nome da tabela.
 */
export const organizations = mysqlTable("organizations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Dados de cobrança (Stripe) — nulos até a organização pagar pela
  // primeira vez. Preenchidos só depois que o pagamento é confirmado de
  // verdade (webhook do Stripe), nunca antes — ver server/routers/signup.ts.
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  // Espelha o status da assinatura no Stripe (active, past_due, canceled,
  // etc — usa exatamente os mesmos nomes que o Stripe usa, sem traduzir,
  // pra nunca ficar em dúvida na hora de comparar com o painel do Stripe).
  subscriptionStatus: varchar("subscriptionStatus", { length: 50 }),
  // Ideia 5 do Gilvando (modelo de pasta padrão): lista de nomes de
  // pasta (JSON, ex: ["AET","CIPAMIN","DDS"]) que, se preenchida, é
  // oferecida como sugestão pronta ao criar um contrato novo — cria
  // essas pastas automaticamente na raiz da Nuvem do contrato, se a
  // pessoa optar. Null/vazio = nenhum modelo definido ainda.
  folderTemplate: text("folderTemplate"),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * Cadastro público de organização (empresa) ainda não confirmado por
 * e-mail. A organização e o administrador "dono" só passam a existir de
 * verdade nas tabelas organizations/admins depois que a pessoa clica no
 * link de confirmação — evita que qualquer cadastro (mesmo nunca
 * confirmado) já ocupe espaço permanente ou colida com dado de
 * verdade. Linha removida assim que confirmada (ou quando expira).
 */
export const pendingSignups = mysqlTable("pendingSignups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  organizationName: varchar("organizationName", { length: 120 }).notNull(),
  organizationSlug: varchar("organizationSlug", { length: 60 }).notNull(),
  adminUsername: varchar("adminUsername", { length: 100 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PendingSignup = typeof pendingSignups.$inferSelect;
export type InsertPendingSignup = typeof pendingSignups.$inferInsert;

/**
 * Sessão do programa de sincronização de pasta local (Windows) — uma
 * linha por "login" feito no programa, pra deixar cada uma revogável
 * individualmente. Antes, o token JWT do desktop-sync não tinha nenhum
 * registro correspondente no banco: se um computador fosse perdido ou
 * roubado, a única forma de invalidar o acesso era trocar o
 * SESSION_SECRET inteiro, derrubando TODAS as sessões (site e desktop)
 * de uma vez (achado de auditoria de segurança, 07/09). Com esta
 * tabela, o token carrega o id de uma sessão aqui, e cada verificação
 * confere se essa sessão específica ainda não foi revogada.
 */
export const desktopSessions = mysqlTable("desktopSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  username: varchar("username", { length: 255 }).notNull(),
  // null pro acesso mestre de recuperação, que não tem linha própria em
  // admins (mesmo espírito de admins.organizationId).
  adminId: varchar("adminId", { length: 64 }),
  // Nome que a pessoa dá ao computador no momento do login (ex: "PC
  // Escritório") — o próprio programa sugere o nome do computador via
  // os.hostname(), mas a pessoa pode trocar. Null em sessões antigas,
  // de antes desta coluna existir.
  deviceName: varchar("deviceName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type DesktopSession = typeof desktopSessions.$inferSelect;
export type InsertDesktopSession = typeof desktopSessions.$inferInsert;

/**
 * Contratos atendidos pelo sistema. Antes era uma lista fixa no código; agora
 * o administrador cadastra, edita e exclui pela própria interface.
 */
export const contracts = mysqlTable("contracts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  // Organização dona deste contrato — ver comentário na tabela
  // organizations acima. Nullable por enquanto (etapa inicial da
  // migração pra multi-empresa); toda linha já existente foi
  // preenchida automaticamente na mesma migração que criou a coluna.
  organizationId: varchar("organizationId", { length: 64 }),
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
  // Nome de quem gerencia este contrato — usado no crachá padrão, no campo
  // "Superior/Gestor do contrato" (antes era um nome fixo no código).
  managerName: varchar("managerName", { length: 120 }),
  // PGR anexado no cadastro do contrato — pré-requisito para gerar uma
  // Ordem de Serviço (ver shared/document-types.ts, tipo "os"). Sem data de
  // validade: cabe ao administrador reanexar quando precisar atualizar.
  pgrFileUrl: text("pgrFileUrl"),
  pgrFileName: varchar("pgrFileName", { length: 255 }),
  pgrUploadedAt: timestamp("pgrUploadedAt"),
  // Razão social impressa no cabeçalho da Ordem de Serviço (Documentação).
  companyName: varchar("companyName", { length: 255 }),
  // "Medidas de Controle Existentes" da Ordem de Serviço — fixo dentro do
  // contrato (mesmo texto pra todas as funções), mas varia entre
  // contratos diferentes. Configurado uma vez em Documentação → OS por
  // Função → "padrão do contrato".
  osMedidasAdministrativas: text("osMedidasAdministrativas"),
  osMedidasEngenharia: text("osMedidasEngenharia"),
  osEpisMinimos: text("osEpisMinimos"),
  // Gerência padrão deste contrato — usada na Ordem de Serviço (mesmo
  // texto pra todas as funções, evita digitar de novo em cada
  // colaborador). Independente do campo "gerencia" de cada colaborador
  // (usado no crachá).
  gerencia: varchar("gerencia", { length: 150 }),
  // Lançamentos RQA's (ideia do Gilvando, 16/09) — habilitado por
  // padrão desligado, já que é um módulo novo e nem todo contrato usa.
  // Meta individual = quantidade esperada de RQA por colaborador ativo
  // no mês (2 é o valor que a planilha antiga usava por padrão).
  rqaEnabled: boolean("rqaEnabled").default(false).notNull(),
  rqaMetaIndividual: int("rqaMetaIndividual").default(2).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContractRow = typeof contracts.$inferSelect;
export type InsertContractRow = typeof contracts.$inferInsert;

/**
 * Lançamentos mensais de RQA (Registro de Quase Acidente) por colaborador —
 * substitui a planilha de Excel que o Gilvando usava (ideia dele, 16/09).
 * Um registro por colaborador por mês; tudo o mais (meta, % alcançada,
 * status, ranking, resumo por líder/área) é calculado a partir disto,
 * nunca guardado — igual a planilha fazia com fórmula.
 */
export const rqaEntries = mysqlTable(
  "rqaEntries",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    employeeId: varchar("employeeId", { length: 64 }).notNull(),
    // Formato "AAAA-MM" (ex: "2026-09") — simples de comparar/ordenar como texto.
    yearMonth: varchar("yearMonth", { length: 7 }).notNull(),
    quantidade: int("quantidade").default(0).notNull(),
    // "ATIVO" | "FERIAS" | "AFASTADO" | "INATIVO" — muda de mês pra mês
    // (alguém pode estar de férias em setembro e ativo em outubro), por
    // isso mora no lançamento do mês, não no cadastro fixo do
    // colaborador. Sem meta/cobrança pra quem não está ATIVO no mês.
    situacao: varchar("situacao", { length: 20 }).default("ATIVO").notNull(),
    updatedBy: varchar("updatedBy", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    employeeMonthUnique: uniqueIndex("rqaEntries_employeeId_yearMonth_unique").on(table.employeeId, table.yearMonth),
  })
);

export type RqaEntry = typeof rqaEntries.$inferSelect;
export type InsertRqaEntry = typeof rqaEntries.$inferInsert;

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
  // Lixeira: null = ativa. Preenchido = está na lixeira, pode ser restaurada
  // até ser excluída definitivamente.
  deletedAt: timestamp("deletedAt"),
  deletedBy: varchar("deletedBy", { length: 100 }),
  trashBatchId: varchar("trashBatchId", { length: 64 }),
  // Quando preenchido, só quem for membro deste grupo (ou o administrador
  // principal) consegue ENTRAR na pasta — mas o nome dela continua
  // aparecendo pra todo mundo na listagem de cima. Subpastas/arquivos
  // criados aqui dentro herdam esta mesma restrição automaticamente.
  restrictedToGroupId: varchar("restrictedToGroupId", { length: 64 }),
});

export const cloudFiles = mysqlTable("cloudFiles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  // null = arquivo na raiz do contrato (fora de qualquer pasta)
  folderId: varchar("folderId", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  // Legado: arquivos enviados antes da migração para o R2 continuam com o
  // link direto do Supabase Storage aqui. Novos uploads deixam isso vazio e
  // usam r2Key.
  fileUrl: text("fileUrl"),
  // Novo: chave do objeto no Cloudflare R2 — o conteúdo físico do arquivo
  // fica lá, nunca no banco. Download gera uma URL assinada temporária.
  r2Key: text("r2Key"),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  uploadedBy: varchar("uploadedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"),
  deletedBy: varchar("deletedBy", { length: 100 }),
  trashBatchId: varchar("trashBatchId", { length: 64 }),
  // Trava de edicao: enquanto preenchido, so quem travou (ou um admin) pode
  // enviar uma nova versao. Expira sozinha depois de um tempo (ver
  // isLockActive em db-cloud.ts) caso a pessoa esqueca de liberar.
  lockedBy: varchar("lockedBy", { length: 100 }),
  lockedAt: timestamp("lockedAt"),
});

export type CloudFolderRow = typeof cloudFolders.$inferSelect;

/**
 * Versões antigas de um arquivo — guardadas sempre que uma nova versão é
 * enviada, antes do arquivo "atual" (em cloudFiles) ser substituído. Nunca
 * apaga o conteúdo antigo do R2 automaticamente; só na exclusão definitiva
 * do arquivo é que as versões somem de vez.
 */
export const cloudFileVersions = mysqlTable("cloudFileVersions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  fileId: varchar("fileId", { length: 64 }).notNull(),
  r2Key: text("r2Key"),
  fileUrl: text("fileUrl"),
  fileSize: int("fileSize"),
  mimeType: varchar("mimeType", { length: 100 }),
  uploadedBy: varchar("uploadedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CloudFileRow = typeof cloudFiles.$inferSelect;

/** Favoritos — um arquivo ou uma pasta, nunca os dois ao mesmo tempo. */
export const cloudFavorites = mysqlTable("cloudFavorites", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  fileId: varchar("fileId", { length: 64 }),
  folderId: varchar("folderId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Compartilhamento pessoa a pessoa (arquivo ou pasta). Concede acesso a
 * quem normalmente não veria aquele item, com um nível de permissão
 * específico — independe da permissão geral viewCloud/manageCloud de quem
 * recebe.
 */
export const cloudShares = mysqlTable("cloudShares", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  fileId: varchar("fileId", { length: 64 }),
  folderId: varchar("folderId", { length: 64 }),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  sharedBy: varchar("sharedBy", { length: 100 }).notNull(),
  // Um compartilhamento é com uma PESSOA (sharedWith) OU com um GRUPO
  // (sharedWithGroupId) — nunca os dois ao mesmo tempo.
  sharedWith: varchar("sharedWith", { length: 100 }),
  sharedWithGroupId: varchar("sharedWithGroupId", { length: 64 }),
  permission: mysqlEnum("permission", ["view", "download", "edit"]).default("view").notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Grupos (setor/cargo/equipe) — compartilhar com o grupo inteiro de uma vez. */
export const cloudGroups = mysqlTable("cloudGroups", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  // Quando preenchido, todo mundo cujo setor (admins.setor) bater com este
  // valor entra no grupo automaticamente, sem precisar adicionar um por um.
  autoSetor: varchar("autoSetor", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const cloudGroupMembers = mysqlTable("cloudGroupMembers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  groupId: varchar("groupId", { length: 64 }).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Configuração de espaço de armazenamento por contrato. limitBytes começa
 * em 10GB — é só mudar esse número (sem tocar em código) pra crescer para
 * 100GB, 1TB, etc. usedBytes é mantido em dia a cada upload/exclusão, com
 * uma rotina de recálculo disponível caso algo fique dessincronizado.
 */
export const cloudStorageConfig = mysqlTable("cloudStorageConfig", {
  contractSlug: varchar("contractSlug", { length: 60 }).primaryKey(),
  limitBytes: bigint("limitBytes", { mode: "number" }).default(10737418240).notNull(), // 10 GB
  usedBytes: bigint("usedBytes", { mode: "number" }).default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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
  // Segundo anexo opcional: PDF do pedido de compras / ordem de serviço do
  // fornecedor, separado do PDF da nota fiscal em si.
  fileName2: varchar("fileName2", { length: 255 }),
  fileUrl2: text("fileUrl2"),
  fileSize2: int("fileSize2"),
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

/**
 * Catálogo de funções — a lista fixa (PREDEFINED_ROLES no cliente) mais o
 * que o administrador cadastrar. Compartilhado entre todos os contratos.
 */
export const customRoles = mysqlTable("customRoles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CustomRoleRow = typeof customRoles.$inferSelect;

/**
 * Catálogo de tipos de treinamento — cada um com a validade em meses
 * (ex: NR-35 = 24 meses). A data de vencimento do treinamento de um
 * colaborador é sempre calculada a partir disso, nunca digitada à mão.
 */
export const trainingTypes = mysqlTable("trainingTypes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  validityMonths: int("validityMonths").notNull().default(12),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TrainingTypeRow = typeof trainingTypes.$inferSelect;

/**
 * Almoxarifado — itens em estoque, migrado de um sistema separado
 * (Supabase). Separado por contrato, como o resto do sistema.
 * Nomes de campo em português para bater com os dados já existentes.
 */
export const warehouseItems = mysqlTable("warehouseItems", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", [
    "epi",
    "ferramenta",
    "equipamento",
    "material_consumo",
    "material_limpeza",
    "gas",
    "material",
  ])
    .default("material_consumo")
    .notNull(),
  unit: varchar("unit", { length: 20 }).default("un").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).default("0").notNull(),
  // Comuns a qualquer tipo de item
  marca: varchar("marca", { length: 150 }),
  modelo: varchar("modelo", { length: 150 }),
  categoria: varchar("categoria", { length: 100 }),
  observacoes: text("observacoes"),
  // Obrigatório para EPI
  ca: varchar("ca", { length: 50 }),
  dataValidadeCa: varchar("dataValidadeCa", { length: 10 }),
  tamanho: varchar("tamanho", { length: 30 }),
  periodicidadeTrocaMeses: int("periodicidadeTrocaMeses"),
  // Obrigatório para Ferramenta
  patrimonio: varchar("patrimonio", { length: 100 }),
  numeroSerie: varchar("numeroSerie", { length: 100 }),
  dataAquisicao: varchar("dataAquisicao", { length: 10 }),
  estadoConservacao: mysqlEnum("estadoConservacao", ["novo", "bom", "regular", "ruim"]),
  estoqueMinimo: decimal("estoqueMinimo", { precision: 12, scale: 2 }).default("10").notNull(),
  // Sempre estoqueMinimo × 1,2 — recalculado a cada gravação, não editável direto.
  estoqueSeguranca: decimal("estoqueSeguranca", { precision: 12, scale: 2 }).default("12").notNull(),
  estoqueMaximo: decimal("estoqueMaximo", { precision: 12, scale: 2 }),
  localizacao: varchar("localizacao", { length: 150 }),
  fornecedor: varchar("fornecedor", { length: 150 }),
  precoUnitario: decimal("precoUnitario", { precision: 12, scale: 2 }).default("0").notNull(),
  // Validade geral do item (materiais/gás), diferente da validade do CA.
  dataValidade: varchar("dataValidade", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WarehouseItem = typeof warehouseItems.$inferSelect;
export type InsertWarehouseItem = typeof warehouseItems.$inferInsert;

/**
 * Almoxarifado — movimentações de estoque (entrada/saída), para manter o
 * histórico de quem retirou o quê e quando.
 */
export const warehouseMovements = mysqlTable("warehouseMovements", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  itemId: varchar("itemId", { length: 64 }),
  itemCode: varchar("itemCode", { length: 100 }).notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  movementType: mysqlEnum("movementType", ["entrada", "saida"]).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  destination: varchar("destination", { length: 255 }),
  responsible: varchar("responsible", { length: 150 }),
  invoiceNumber: varchar("invoiceNumber", { length: 100 }),
  purchaseOrder: varchar("purchaseOrder", { length: 100 }),
  supplier: varchar("supplier", { length: 150 }),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WarehouseMovement = typeof warehouseMovements.$inferSelect;
export type InsertWarehouseMovement = typeof warehouseMovements.$inferInsert;

/**
 * Almoxarifado — entrega e devolução de ferramentas/EPIs para colaboradores.
 * Usa o colaborador que já existe no sistema (employees), não duplica
 * cadastro de funcionário como o sistema original fazia.
 */
export const toolDeliveries = mysqlTable("toolDeliveries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  employeeId: varchar("employeeId", { length: 64 }).notNull(),
  employeeName: varchar("employeeName", { length: 255 }).notNull(),
  itemId: varchar("itemId", { length: 64 }).notNull(),
  itemCode: varchar("itemCode", { length: 100 }).notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["entregue", "devolvido"]).default("entregue").notNull(),
  obs: text("obs"),
  returnObs: text("returnObs"),
  deliveredBy: varchar("deliveredBy", { length: 100 }),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
  returnedAt: timestamp("returnedAt"),
});

export type ToolDelivery = typeof toolDeliveries.$inferSelect;
export type InsertToolDelivery = typeof toolDeliveries.$inferInsert;

/**
 * Almoxarifado — solicitações de compra. Uma solicitação pode ter vários
 * itens de uma vez (guardados como JSON, como o sistema original fazia).
 */
export const purchaseRequests = mysqlTable("purchaseRequests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contract: varchar("contract", { length: 40 }).default("lom").notNull(),
  // Numeração sequencial por contrato, ex: SC-0001.
  registro: varchar("registro", { length: 20 }).notNull(),
  // JSON: [{ name, quantity, fornecedor, priority }]
  items: text("items").notNull(),
  priority: mysqlEnum("priority", ["baixa", "normal", "alta", "urgente", "emergencial"])
    .default("normal")
    .notNull(),
  status: mysqlEnum("status", ["pendente", "aprovada", "em_processo", "concluida", "cancelada", "expirada"])
    .default("pendente")
    .notNull(),
  cancelReason: text("cancelReason"),
  requestedBy: varchar("requestedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
});

export type PurchaseRequestRow = typeof purchaseRequests.$inferSelect;
export type InsertPurchaseRequestRow = typeof purchaseRequests.$inferInsert;

/**
 * Documentação — EPIs padrão por função, usados para pré-preencher a Ficha
 * de EPI de cada colaborador. Cada contrato define sua própria lista por
 * função (a mesma função pode ter EPIs diferentes em contratos diferentes).
 */
export const epiRoleItems = mysqlTable("epiRoleItems", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 40 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  // Ordem de exibição na tabela da ficha.
  sortOrder: int("sortOrder").default(0).notNull(),
  quantity: int("quantity").default(1).notNull(),
  specification: varchar("specification", { length: 255 }).notNull(),
  ca: varchar("ca", { length: 50 }),
  responsibleName: varchar("responsibleName", { length: 150 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EpiRoleItemRow = typeof epiRoleItems.$inferSelect;
export type InsertEpiRoleItemRow = typeof epiRoleItems.$inferInsert;

/**
 * Documentação — Ordem de Serviço (NR-01) por função. Cada contrato define,
 * por função, os textos que preenchem a OS de quem exerce aquela função:
 * área/setor, tarefas, agentes ambientais, medidas de controle e EPIs
 * mínimos. Um registro por (contractSlug, role) — substituído por inteiro
 * a cada salvamento (mesma lógica de epiRoleItems).
 */
export const osRoleConfig = mysqlTable("osRoleConfig", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 40 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  area: varchar("area", { length: 255 }),
  setorTrabalho: varchar("setorTrabalho", { length: 255 }),
  maquinasEquipamentos: text("maquinasEquipamentos"),
  tarefas: text("tarefas"),
  agentesFisicos: text("agentesFisicos"),
  agentesQuimicos: text("agentesQuimicos"),
  agentesBiologicos: text("agentesBiologicos"),
  agentesErgonomicos: text("agentesErgonomicos"),
  agentesAcidentes: text("agentesAcidentes"),
  medidasAdministrativas: text("medidasAdministrativas"),
  medidasEngenharia: text("medidasEngenharia"),
  episMinimos: text("episMinimos"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type OsRoleConfigRow = typeof osRoleConfig.$inferSelect;
export type InsertOsRoleConfigRow = typeof osRoleConfig.$inferInsert;

/**
 * Guarda os metadados do instalador atual do programa de sincronização
 * com a Nuvem (Windows) — o arquivo em si fica no R2, aqui só fica o
 * "endereço" dele (r2Key) e informação pra mostrar na tela (versão,
 * tamanho, quando foi enviado). Só existe uma linha por vez — enviar uma
 * versão nova substitui a anterior (a antiga é removida do R2 junto).
 */
export const desktopInstaller = mysqlTable("desktopInstaller", {
  id: int("id").autoincrement().primaryKey(),
  r2Key: varchar("r2Key", { length: 255 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  sha512: varchar("sha512", { length: 88 }),
  version: varchar("version", { length: 50 }).notNull(),
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  uploadedBy: varchar("uploadedBy", { length: 255 }).notNull(),
});

export type DesktopInstallerRow = typeof desktopInstaller.$inferSelect;
export type InsertDesktopInstallerRow = typeof desktopInstaller.$inferInsert;


/** Durable idempotency result; contains no login token or password. */
export const completedSignups = mysqlTable("completedSignups", {
  pendingSignupId: varchar("pendingSignupId", { length: 64 }).primaryKey(),
  checkoutSessionId: varchar("checkoutSessionId", { length: 255 }).notNull().unique(),
  organizationId: varchar("organizationId", { length: 64 }).notNull(),
  adminId: varchar("adminId", { length: 64 }).notNull(),
  customerId: varchar("customerId", { length: 255 }).notNull(),
  subscriptionId: varchar("subscriptionId", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Temporary capacity held for in-progress uploads; expires after interruption. */
export const cloudStorageReservations = mysqlTable("cloudStorageReservations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  contractSlug: varchar("contractSlug", { length: 60 }).notNull(),
  bytes: bigint("bytes", { mode: 'number' }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

// Only a digest is stored; HR hands the one-use activation code to its owner.
export const employeePortalInvitations = mysqlTable("employeePortalInvitations", {
  employeeId: varchar("employeeId", { length: 64 }).primaryKey(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

