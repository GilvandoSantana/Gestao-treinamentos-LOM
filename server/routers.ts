import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { cloudRouter } from "./routers/cloud";
import { invoicesRouter } from "./routers/invoices";
import { fdsRouter } from "./routers/fds";
import { contractsRouter } from "./routers/contracts";
import { rolesRouter } from "./routers/roles";
import { trainingTypesRouter } from "./routers/training-types";
import { warehouseRouter } from "./routers/warehouse";
import { employeesRouter } from "./routers/employees";
import { trainingsRouter } from "./routers/trainings";
import { emailHistoryRouter } from "./routers/email-history";
import { certificatesRouter } from "./routers/certificates";
import { epiConfigRouter } from "./routers/epi-config";
import { osConfigRouter } from "./routers/os-config";
import { desktopInstallerRouter } from "./routers/desktop-installer";
import { signupRouter } from "./routers/signup";
import { employeePortalRouter } from "./routers/employee-portal";
import { backupRouter } from "./routers/backup";
import { rqaRouter } from "./routers/rqa";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,

  // Nuvem de arquivos por contrato (estilo SharePoint). Acesso controlado
  // pelas permissões viewCloud/manageCloud, individuais por usuário.
  cloud: cloudRouter,

  // Notas Fiscais e recibos — separados por contrato.
  invoices: invoicesRouter,

  // FDS — Ficha de Dados de Segurança
  fds: fdsRouter,

  // Contratos — SOMENTE o administrador principal gerencia.
  contracts: contractsRouter,

  // Catálogo de funções e tipos de treinamento — compartilhado entre
  // contratos. Só o administrador principal cadastra/edita/exclui; qualquer
  // pessoa logada pode listar (é o que preenche os menus do formulário).
  roles: rolesRouter,
  trainingTypes: trainingTypesRouter,

  // Almoxarifado — itens em estoque e movimentações, por contrato.
  warehouse: warehouseRouter,

  employees: employeesRouter,
  trainings: trainingsRouter,
  emailHistory: emailHistoryRouter,
  certificates: certificatesRouter,

  // Documentação — EPIs padrão por função, usados para pré-preencher a
  // Ficha de EPI. Cada contrato define sua própria lista por função.
  epiConfig: epiConfigRouter,

  // Documentação — Ordem de Serviço (NR-01) por função. Cada contrato
  // define, por função, os textos que preenchem a OS de quem exerce
  // aquela função.
  osConfig: osConfigRouter,

  // Instalador do programa de sincronização com a Nuvem (Windows) —
  // disponível pra download direto no site, dentro da aba da Nuvem.
  desktopInstaller: desktopInstallerRouter,

  // Cadastro público de organização nova (com confirmação por e-mail).
  signup: signupRouter,

  // Portal de autoatendimento do colaborador (CPF + PIN, só leitura).
  employeePortal: employeePortalRouter,

  // Backup do banco de dados (rodar manualmente, listar) — só admin principal.
  backup: backupRouter,

  // Lançamentos RQA's (ideia do Gilvando, 16/09) — substitui a planilha de
  // Excel mensal. Habilitado por contrato (contracts.rqaEnabled).
  rqa: rqaRouter,
});

export type AppRouter = typeof appRouter;
