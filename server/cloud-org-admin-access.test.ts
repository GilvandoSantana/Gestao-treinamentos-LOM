import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Achado real (Gilvando, 14/09): "Erro ao esvaziar a lixeira" — a causa
// era eu ter usado masterAdminProcedure (exige o login de recuperação da
// PLATAFORMA inteira, siteOrganizationId null) em vez de
// organizationAdminProcedure (exige só ser administrador da PRÓPRIA
// organização) em varias rotas que eu mesmo construí. Confundi o PAPEL
// "administrador principal" com o procedimento mais restrito. Estes
// testes confirmam que uma conta administradora normal (de uma
// organização de verdade, não o login de recuperação) consegue usar
// essas ferramentas.

vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./db-cloud", async () => {
  const actual = await vi.importActual("./db-cloud");
  return {
    ...actual,
    listTrash: vi.fn(async () => ({ folders: [], files: [] })),
    recalculateStorageUsed: vi.fn(async () => 0),
    getStorageByTopFolder: vi.fn(async () => []),
  };
});

vi.mock("./db-cloud-dedup", () => ({
  findDuplicateFolderGroups: vi.fn(async () => []),
  mergeFolderInto: vi.fn(async () => ({ filesMoved: 0, foldersMoved: 0, foldersMerged: 0 })),
}));

vi.mock("./r2-storage", () => ({
  deleteFromR2: vi.fn(),
  isR2Configured: false,
}));

vi.mock("./supabase-storage", () => ({
  deleteCloudFileFromSupabase: vi.fn(),
  getAllPhotoUrls: vi.fn(() => Promise.resolve(new Map())),
}));

/** Administrador de uma organização de VERDADE — não o login de
 * recuperação da plataforma (que teria siteOrganizationId: null). É
 * exatamente o tipo de conta que o Gilvando usa no dia a dia. */
function createOrgAdminContext(): TrpcContext {
  return {
    user: null,
    isSiteAdmin: true,
    siteAdminUsername: "gilvando",
    siteContract: "lom",
    siteRole: "admin",
    siteOrganizationId: "org-real-123",
    sitePermissions: null,
    req: { protocol: "https", headers: { "x-active-contract": "lom" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ferramentas da Nuvem aceitam administrador de organização (não só o login de recuperação)", () => {
  it("cloud.emptyTrash não recusa com FORBIDDEN pra administrador de organização", async () => {
    const caller = appRouter.createCaller(createOrgAdminContext());
    await expect(caller.cloud.emptyTrash()).resolves.toBeDefined();
  });

  it("cloud.findDuplicateFolders não recusa com FORBIDDEN pra administrador de organização", async () => {
    const caller = appRouter.createCaller(createOrgAdminContext());
    await expect(caller.cloud.findDuplicateFolders()).resolves.toBeDefined();
  });

  it("cloud.storageByFolder não recusa com FORBIDDEN pra administrador de organização", async () => {
    const caller = appRouter.createCaller(createOrgAdminContext());
    await expect(caller.cloud.storageByFolder()).resolves.toBeDefined();
  });

  it("cloud.mergeDuplicateFolders não recusa com FORBIDDEN pra administrador de organização", async () => {
    const caller = appRouter.createCaller(createOrgAdminContext());
    await expect(
      caller.cloud.mergeDuplicateFolders({ keepId: "a", duplicateIds: ["b"] })
    ).resolves.toBeDefined();
  });

  it("mas continua recusando uma conta COMUM (não administradora) — a preocupação real da auditoria original", async () => {
    const regularUserContext: TrpcContext = {
      ...createOrgAdminContext(),
      siteRole: "user",
      sitePermissions: { manageCloud: true } as TrpcContext["sitePermissions"],
    };
    const caller = appRouter.createCaller(regularUserContext);
    await expect(caller.cloud.emptyTrash()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
