import { siteAdminProcedure, router } from "../_core/trpc";
import { getCurrentInstaller } from "../db-desktop-installer";
import { getR2DownloadUrl, isR2Configured } from "../r2-storage";

export const desktopInstallerRouter = router({
  // Qualquer pessoa logada no site pode ver se existe um instalador
  // disponível e baixar — não é uma informação sensível por contrato,
  // é o mesmo programa pra todo mundo que usa o sistema.
  getInfo: siteAdminProcedure.query(async () => {
    const installer = await getCurrentInstaller();
    if (!installer || !isR2Configured) return null;
    return {
      version: installer.version,
      fileName: installer.fileName,
      fileSize: installer.fileSize,
      uploadedAt: installer.uploadedAt,
    };
  }),

  getDownloadUrl: siteAdminProcedure.query(async () => {
    const installer = await getCurrentInstaller();
    if (!installer || !isR2Configured) return null;
    // Validade mais longa que o padrão de arquivo da Nuvem (1h) — o link
    // fica exposto na tela por mais tempo antes da pessoa clicar.
    const url = await getR2DownloadUrl(installer.r2Key, installer.fileName, 6 * 60 * 60);
    return { url };
  }),
});
