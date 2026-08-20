/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseBackupPanel: baixa uma cópia de tudo (itens, movimentações,
 * entregas, solicitações de compra) em um único arquivo JSON.
 *
 * É uma cópia extra por conveniência — o banco já tem backup automático no
 * Railway; isso aqui é pra quem quer guardar uma cópia própria também.
 */

import { useRef, useState } from 'react';
import { Database, Download, Upload, CheckCircle2, Loader, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import type { WarehouseItemType } from '@shared/warehouse';

interface BackupEntry {
  date: string;
  items: number;
  movements: number;
  deliveries: number;
  purchaseRequests: number;
}

export default function WarehouseBackupPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [history, setHistory] = useState<BackupEntry[]>([]);
  const utils = trpc.useUtils();
  const upsertItemMutation = trpc.warehouse.upsertItem.useMutation();
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (importInputRef.current) importInputRef.current.value = '';
    if (!file) return;

    if (
      !window.confirm(
        'Isso vai recriar os itens do arquivo de backup como itens NOVOS (não substitui os que já existem, para não perder nada por engano). Confirma?'
      )
    ) {
      return;
    }

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        toast.error('Nenhum item encontrado neste arquivo de backup.');
        return;
      }

      let created = 0;
      let failed = 0;
      for (const item of items) {
        try {
          await upsertItemMutation.mutateAsync({
            code: item.code,
            name: item.name,
            type: (item.type ?? 'material') as WarehouseItemType,
            unit: item.unit ?? 'un',
            quantity: Number(item.quantity) || 0,
            ca: item.ca ?? null,
            dataValidadeCa: item.dataValidadeCa ?? null,
            patrimonio: item.patrimonio ?? null,
            estoqueMinimo: Number(item.estoqueMinimo) || 10,
            localizacao: item.localizacao ?? null,
            fornecedor: item.fornecedor ?? null,
            precoUnitario: Number(item.precoUnitario) || 0,
            dataValidade: item.dataValidade ?? null,
          });
          created++;
        } catch {
          failed++;
        }
      }
      await utils.warehouse.listItems.invalidate();
      toast.success(`${created} item(ns) restaurado(s)${failed > 0 ? `, ${failed} falharam` : ''}.`);
    } catch (error) {
      toast.error('Erro ao importar backup. Confira se é um arquivo JSON válido gerado por aqui.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleBackup = async () => {
    setIsExporting(true);
    try {
      const [items, movements, deliveries, purchaseRequests] = await Promise.all([
        utils.client.warehouse.listItems.query(),
        utils.client.warehouse.listMovements.query(),
        utils.client.warehouse.listDeliveries.query(),
        utils.client.warehouse.listPurchaseRequests.query(),
      ]);

      const backupData = {
        timestamp: new Date().toISOString(),
        items,
        movements,
        deliveries,
        purchaseRequests,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-almoxarifado-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setHistory((prev) => [
        {
          date: new Date().toISOString(),
          items: items.length,
          movements: movements.length,
          deliveries: deliveries.length,
          purchaseRequests: purchaseRequests.length,
        },
        ...prev,
      ]);
      toast.success('Backup baixado com sucesso.');
    } catch (error) {
      toast.error('Erro ao gerar backup.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="p-5 rounded-xl border border-border bg-muted/20 text-center">
        <Database size={28} className="text-orange mx-auto mb-3" />
        <p className="text-sm font-semibold text-foreground mb-1">Backup do Almoxarifado</p>
        <p className="text-xs text-muted-foreground mb-4">
          Baixa um arquivo com todos os itens, movimentações, entregas e solicitações de compra
          deste contrato — uma cópia extra, além do backup automático que o sistema já mantém.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={handleBackup}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
          >
            {isExporting ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
            {isExporting ? 'Gerando...' : 'Baixar backup agora'}
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-lg bg-navy text-white hover:opacity-90 disabled:opacity-50"
          >
            {isImporting ? <Loader size={15} className="animate-spin" /> : <Upload size={15} />}
            {isImporting ? 'Importando...' : 'Importar Backup'}
          </button>
          <input ref={importInputRef} type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
        </div>
        <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground mt-2">
          <AlertTriangle size={11} />
          Importar recria os itens como novos — não substitui os que já existem.
        </p>
      </div>

      {history.length > 0 && (
        <div className="mt-4">
          <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Backups baixados nesta sessão
          </p>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20 text-xs"
              >
                <span className="flex items-center gap-1.5 text-foreground">
                  <CheckCircle2 size={13} className="text-teal" />
                  {new Date(h.date).toLocaleString('pt-BR')}
                </span>
                <span className="text-muted-foreground font-technical">
                  {h.items} itens · {h.movements} mov. · {h.deliveries} entregas · {h.purchaseRequests} solic.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
