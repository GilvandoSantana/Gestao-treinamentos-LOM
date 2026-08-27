/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseMovementsPanel: registrar entrada de estoque (Reposição de
 * Estoque) e ver o histórico de entradas.
 *
 * A saída de material foi unificada com a entrega de ferramentas — ver
 * WarehouseOutboundPanel.
 */

import { useState } from 'react';
import { ArrowDownCircle, Loader, QrCode } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import QrCodeReader from '@/components/QrCodeReader';
import WarehouseItemCombobox from '@/components/WarehouseItemCombobox';

interface WarehouseMovementsPanelProps {
  canManage: boolean;
}

export default function WarehouseMovementsPanel({ canManage }: WarehouseMovementsPanelProps) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const movementsQuery = trpc.warehouse.listMovements.useQuery();
  const createMutation = trpc.warehouse.createMovement.useMutation();

  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [responsible, setResponsible] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [qrReaderOpen, setQrReaderOpen] = useState(false);

  const items = itemsQuery.data ?? [];

  const handleQrScan = (value: string) => {
    const code = value.replace(/^MAT:/, '');
    const found = items.find((i) => i.code === code);
    if (found) {
      setItemId(found.id);
      toast.success(`Item identificado: ${found.name}`);
    } else {
      toast.error('Item não encontrado para esse QR code.');
    }
    setQrReaderOpen(false);
  };

  const reset = () => {
    setItemId('');
    setQuantity('');
    setResponsible('');
    setSupplier('');
    setInvoiceNumber('');
    setPurchaseOrder('');
    setUnitPrice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!itemId || !qty || qty <= 0) {
      toast.error('Escolha o item e informe uma quantidade válida.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        itemId,
        movementType: 'entrada',
        quantity: qty,
        destination: null,
        responsible: responsible || null,
        supplier: supplier || null,
        invoiceNumber: invoiceNumber || null,
        purchaseOrder: purchaseOrder || null,
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
        notes: null,
      });
      toast.success('Entrada registrada.');
      reset();
      await Promise.all([utils.warehouse.listItems.invalidate(), utils.warehouse.listMovements.invalidate()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar movimentação.');
    }
  };

  return (
    <div>
      {canManage && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-xl border border-border bg-muted/30 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Item</label>
            <div className="flex gap-1.5">
              <WarehouseItemCombobox items={items} value={itemId} onChange={setItemId} />
              <button
                type="button"
                onClick={() => setQrReaderOpen(true)}
                title="Ler QR code do item"
                className="shrink-0 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-orange hover:border-orange transition"
              >
                <QrCode size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Quantidade</label>
              <input
                type="number"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Responsável</label>
              <input
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Fornecedor</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Nota fiscal</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Pedido de compra</label>
              <input
                value={purchaseOrder}
                onChange={(e) => setPurchaseOrder(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Valor unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full rounded-lg py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 bg-teal"
          >
            {createMutation.isPending ? 'Registrando...' : 'Registrar entrada'}
          </button>
        </form>
      )}

      {(() => {
        const filtered = (movementsQuery.data ?? []).filter((m) => m.movementType === 'entrada');
        return (
          <>
            <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Histórico ({filtered.length})
            </p>

            {movementsQuery.isLoading && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
                <Loader size={14} className="animate-spin" /> Carregando...
              </p>
            )}
            {!movementsQuery.isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação ainda.</p>
            )}

            <div className="space-y-1.5">
              {filtered.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="p-1.5 rounded-lg shrink-0 bg-teal/10 text-teal">
                      <ArrowDownCircle size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <strong>{m.itemName}</strong> — {m.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {new Date(m.date).toLocaleString('pt-BR')}
                        {m.responsible && <> · {m.responsible}</>}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {qrReaderOpen && <QrCodeReader onScan={handleQrScan} onClose={() => setQrReaderOpen(false)} />}
    </div>
  );
}
