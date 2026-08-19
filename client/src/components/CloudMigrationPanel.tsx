/*
 * Design: Industrial Blueprint — Neo-Industrial
 * CloudMigrationPanel: leva os arquivos antigos (ainda no Supabase Storage)
 * pro Cloudflare R2 — uso único por contrato, só o administrador principal.
 */

import { useState } from 'react';
import { DatabaseZap, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function CloudMigrationPanel() {
  const [expanded, setExpanded] = useState(false);
  const migrateMutation = trpc.cloud.migrateLegacyToR2.useMutation();
  const utils = trpc.useUtils();

  const handleMigrate = async () => {
    if (
      !window.confirm(
        'Isso vai copiar os arquivos que ainda estão no Supabase Storage para o Cloudflare R2. Pode demorar um pouco, dependendo de quantos arquivos existirem. Confirma?'
      )
    ) {
      return;
    }
    try {
      const result = await migrateMutation.mutateAsync();
      if (result.total === 0) {
        toast.success('Nenhum arquivo antigo pra migrar — já está tudo no R2.');
      } else {
        toast.success(`${result.migrated} de ${result.total} arquivo(s) migrado(s) para o R2.`, {
          duration: 8000,
        });
      }
      if (result.failed.length > 0) {
        toast.error(`Não migrado(s): ${result.failed.join(', ')}`, { duration: 15000 });
      }
      await utils.cloud.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro na migração.');
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-dashed border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-orange transition"
      >
        <span className="flex items-center gap-1.5">
          <DatabaseZap size={14} />
          Migrar arquivos antigos para o R2
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <p className="text-xs text-muted-foreground mb-2">
            Arquivos enviados antes do Cloudflare R2 existir ainda funcionam pelo link antigo do
            Supabase. Rodar isso copia o conteúdo deles pro R2 — depois disso, dá pra desligar o
            Supabase sem perder nada.
          </p>
          <button
            onClick={handleMigrate}
            disabled={migrateMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
          >
            {migrateMutation.isPending ? <Loader size={13} className="animate-spin" /> : <DatabaseZap size={13} />}
            {migrateMutation.isPending ? 'Migrando...' : 'Migrar agora'}
          </button>
        </div>
      )}
    </div>
  );
}
