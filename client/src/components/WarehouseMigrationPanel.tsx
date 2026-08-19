/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseMigrationPanel: puxa os dados do almoxarifado antigo (Supabase)
 * pra dentro deste sistema — uso único, só o administrador principal.
 *
 * Roda no servidor (Railway, com acesso à internet), não aqui no navegador.
 * As credenciais do Supabase são digitadas na hora e enviadas só nesta
 * chamada — não ficam guardadas em lugar nenhum do sistema.
 */

import { useState } from 'react';
import { DatabaseZap, AlertTriangle, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

export default function WarehouseMigrationPanel() {
  const [open, setOpen] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const migrateMutation = trpc.warehouse.migrateFromSupabase.useMutation();
  const utils = trpc.useUtils();

  const handleMigrate = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      toast.error('Preencha a URL e a chave do Supabase.');
      return;
    }
    if (
      !window.confirm(
        'Isso vai trazer todos os itens, movimentações, entregas e solicitações de compra do sistema antigo para este contrato. Só funciona se o almoxarifado deste contrato ainda estiver vazio. Confirma?'
      )
    ) {
      return;
    }
    try {
      const result = await migrateMutation.mutateAsync({
        supabaseUrl: supabaseUrl.trim(),
        supabaseServiceKey: supabaseKey.trim(),
      });
      toast.success(
        `Migrado: ${result.items} itens, ${result.movements} movimentações, ${result.deliveries} entregas, ${result.purchaseRequests} solicitações.`,
        { duration: 10000 }
      );
      if (result.warnings.length > 0) {
        result.warnings.forEach((w) => toast.error(w, { duration: 15000 }));
      }
      setSupabaseUrl('');
      setSupabaseKey('');
      setOpen(false);
      await Promise.all([
        utils.warehouse.listItems.invalidate(),
        utils.warehouse.listMovements.invalidate(),
        utils.warehouse.listDeliveries.invalidate(),
        utils.warehouse.listPurchaseRequests.invalidate(),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro na migração.', { duration: 15000 });
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mb-4 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-orange hover:text-orange transition"
      >
        <DatabaseZap size={14} />
        Migrar dados do sistema antigo (Supabase)
      </button>
    );
  }

  return (
    <div className="mb-5 p-4 rounded-xl border border-orange/40 bg-orange/5 space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <DatabaseZap size={15} className="text-orange" />
        Migrar dados do almoxarifado antigo
      </p>
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle size={13} className="shrink-0 mt-0.5 text-warning" />
        Só funciona uma vez, com o almoxarifado deste contrato vazio. As credenciais não ficam
        guardadas — são usadas só nesta chamada.
      </p>
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1">URL do projeto Supabase</label>
        <input
          value={supabaseUrl}
          onChange={(e) => setSupabaseUrl(e.target.value)}
          placeholder="https://xxxxx.supabase.co"
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-foreground mb-1">Chave service_role</label>
        <input
          type="password"
          value={supabaseKey}
          onChange={(e) => setSupabaseKey(e.target.value)}
          placeholder="eyJ..."
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleMigrate}
          disabled={migrateMutation.isPending}
          className="flex-1 flex items-center justify-center gap-1.5 bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {migrateMutation.isPending ? (
            <>
              <Loader size={15} className="animate-spin" />
              Migrando...
            </>
          ) : (
            'Migrar agora'
          )}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={migrateMutation.isPending}
          className="px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
