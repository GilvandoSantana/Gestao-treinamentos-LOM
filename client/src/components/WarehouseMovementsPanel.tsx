/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseMovementsPanel: registrar entrada/saída de estoque e ver o
 * histórico de movimentações.
 */

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import type { WarehouseMovementType } from '@shared/warehouse';

interface WarehouseMovementsPanelProps {
  canManage: boolean;
}

export default function WarehouseMovementsPanel({ canManage }: WarehouseMovementsPanelProps) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const movementsQuery = trpc.warehouse.listMovements.useQuery();
  const createMutation = trpc.warehouse.createMovement.useMutation();

  const [movementType, setMovementType] = useState<WarehouseMovementType>('saida');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState('');
  const [responsible, setResponsible] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const reset = () => {
    setItemId('');
    setQuantity('');
    setDestination('');
    setResponsible('');
    setSupplier('');
    setInvoiceNumber('');
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
        movementType,
        quantity: qty,
        destination: destination || null,
        responsible: responsible || null,
        supplier: movementType === 'entrada' ? supplier || null : null,
        invoiceNumber: movementType === 'entrada' ? invoiceNumber || null : null,
      });
      toast.success(movementType === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.');
      reset();
      await Promise.all([utils.warehouse.listItems.invalidate(), utils.warehouse.listMovements.invalidate()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao registrar movimentação.');
    }
  };

  const items = itemsQuery.data ?? [];

  return (
    <div>
      {canManage && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-xl border border-border bg-muted/30 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMovementType('saida')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition ${
                movementType === 'saida'
                  ? 'bg-danger text-white border-danger'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              <ArrowUpCircle size={15} />
              Saída
            </button>
            <button
              type="button"
              onClick={() => setMovementType('entrada')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border transition ${
                movementType === 'entrada'
                  ? 'bg-teal text-white border-teal'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              <ArrowDownCircle size={15} />
              Entrada
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Item</label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
            >
              <option value="">Selecione um item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code} — {i.name} (estoque: {i.quantity} {i.unit})
                </option>
              ))}
            </select>
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
              <label className="block text-xs font-semibold text-foreground mb-1">
                {movementType === 'saida' ? 'Destino / quem retirou' : 'Responsável'}
              </label>
              <input
                value={movementType === 'saida' ? destination : responsible}
                onChange={(e) =>
                  movementType === 'saida' ? setDestination(e.target.value) : setResponsible(e.target.value)
                }
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          {movementType === 'entrada' && (
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
            </div>
          )}

          <button
            type="submit"
            disabled={createMutation.isPending}
            className={`w-full rounded-lg py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
              movementType === 'saida' ? 'bg-danger' : 'bg-teal'
            }`}
          >
            {createMutation.isPending
              ? 'Registrando...'
              : movementType === 'saida'
                ? 'Registrar saída'
                : 'Registrar entrada'}
          </button>
        </form>
      )}

      <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        Histórico ({movementsQuery.data?.length ?? 0})
      </p>

      {movementsQuery.isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
          <Loader size={14} className="animate-spin" /> Carregando...
        </p>
      )}
      {movementsQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação ainda.</p>
      )}

      <div className="space-y-1.5">
        {movementsQuery.data?.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`p-1.5 rounded-lg shrink-0 ${
                  m.movementType === 'entrada' ? 'bg-teal/10 text-teal' : 'bg-danger/10 text-danger'
                }`}
              >
                {m.movementType === 'entrada' ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">
                  <strong>{m.itemName}</strong> — {m.quantity}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {new Date(m.date).toLocaleString('pt-BR')}
                  {m.destination && <> · {m.destination}</>}
                  {m.responsible && <> · {m.responsible}</>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
