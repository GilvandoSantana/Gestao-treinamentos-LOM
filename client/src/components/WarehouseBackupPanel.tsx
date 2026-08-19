/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseBackupPanel: baixa uma cópia de tudo (itens, movimentações,
 * entregas, solicitações de compra) em um único arquivo JSON.
 *
 * É uma cópia extra por conveniência — o banco já tem backup automático no
 * Railway; isso aqui é pra quem quer guardar uma cópia própria também.
 */

import { useState } from 'react';
import { Database, Download, CheckCircle2, Loader } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface BackupEntry {
  date: string;
  items: number;
  movements: number;
  deliveries: number;
  purchaseRequests: number;
}

export default function WarehouseBackupPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [history, setHistory] = useState<BackupEntry[]>([]);
  const utils = trpc.useUtils();

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
        <button
          onClick={handleBackup}
          disabled={isExporting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
        >
          {isExporting ? <Loader size={15} className="animate-spin" /> : <Download size={15} />}
          {isExporting ? 'Gerando...' : 'Baixar backup agora'}
        </button>
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
