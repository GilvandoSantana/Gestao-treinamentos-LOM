import { masterAdminProcedure, router } from "../_core/trpc";
import { runDatabaseBackup, listBackups } from "../db-backup";

/** Só o administrador principal — backup é uma questão de infraestrutura
 * do sistema inteiro, não de um contrato específico. */
export const backupRouter = router({
  runNow: masterAdminProcedure.mutation(async () => {
    return runDatabaseBackup();
  }),

  list: masterAdminProcedure.query(async () => {
    return listBackups();
  }),
});
