/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseMovementsPanel: registrar entrada/saída de estoque e ver o
 * histórico de movimentações.
 *
 * A saída suporta várias linhas de item por atendimento (ex: um colaborador
 * retirando 10 materiais diferentes de uma vez) — cada linha manda uma
 * chamada separada pro servidor, então um item com problema não trava os
 * demais, igual à importação de planilha de colaboradores.
 */

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Loader, QrCode, Clock, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import QrCodeReader from '@/components/QrCodeReader';
import WarehouseItemCombobox from '@/components/WarehouseItemCombobox';
import { printReceipt } from '@/lib/warehouse-print';
import type { WarehouseMovementType } from '@shared/warehouse';

interface WarehouseMovementsPanelProps {
  canManage: boolean;
  /** Quando definido, trava o tipo de movimentação e esconde o alternador —
   * usado nas abas dedicadas "Saída de Material" e "Reposição de Estoque",
   * que no sistema original são páginas separadas. */
  fixedType?: WarehouseMovementType;
}

/** Uma linha do formulário de saída: um item + a quantidade retirada dele. */
interface SaidaRow {
  localId: string;
  itemId: string;
  quantity: string;
}

const MAX_SAIDA_ROWS = 30;

function makeEmptyRow(): SaidaRow {
  return { localId: crypto.randomUUID(), itemId: '', quantity: '' };
}

type QrTarget = { kind: 'employee' } | { kind: 'item'; rowId: string | null };

export default function WarehouseMovementsPanel({ canManage, fixedType }: WarehouseMovementsPanelProps) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const movementsQuery = trpc.warehouse.listMovements.useQuery();
  const employeesQuery = trpc.employees.list.useQuery();
  const createMutation = trpc.warehouse.createMovement.useMutation();

  const [movementType, setMovementType] = useState<WarehouseMovementType>(fixedType ?? 'saida');

  // --- Modo entrada: um item por vez (fluxo original, sem mudanças) ---
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [responsible, setResponsible] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  // --- Modo saída: várias linhas de item, um destino/área em comum ---
  const [saidaRows, setSaidaRows] = useState<SaidaRow[]>([makeEmptyRow()]);
  const [destination, setDestination] = useState('');
  const [areaUso, setAreaUso] = useState('');

  const [qrReaderFor, setQrReaderFor] = useState<QrTarget | null>(null);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const employees = employeesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  const handleQrScan = (value: string) => {
    if (!qrReaderFor) return;

    if (qrReaderFor.kind === 'employee') {
      const code = value.replace(/^FUNC:/, '');
      const found = employees.find(
        (e) => e.registration === code || e.name.toUpperCase().replace(/\s+/g, '_') === code
      );
      if (found) {
        setDestination(found.name);
        toast.success(`Colaborador identificado: ${found.name}`);
      } else {
        toast.error('Colaborador não encontrado para esse QR code.');
      }
      setQrReaderFor(null);
      return;
    }

    const code = value.replace(/^MAT:/, '');
    const found = items.find((i) => i.code === code);
    if (!found) {
      toast.error('Item não encontrado para esse QR code.');
      setQrReaderFor(null);
      return;
    }

    if (qrReaderFor.rowId) {
      setSaidaRows((rows) => rows.map((r) => (r.localId === qrReaderFor.rowId ? { ...r, itemId: found.id } : r)));
    } else {
      setItemId(found.id);
    }
    toast.success(`Item identificado: ${found.name}`);
    setQrReaderFor(null);
  };

  const reset = () => {
    setItemId('');
    setQuantity('');
    setResponsible('');
    setSupplier('');
    setInvoiceNumber('');
    setPurchaseOrder('');
    setUnitPrice('');
    setSaidaRows([makeEmptyRow()]);
    setDestination('');
    setAreaUso('');
  };

  /** Última vez que um item saiu do estoque — usado como dica em cada linha. */
  const lastWithdrawalFor = (forItemId: string) => {
    if (!forItemId) return null;
    const matches = (movementsQuery.data ?? [])
      .filter((m) => m.itemId === forItemId && m.movementType === 'saida')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return matches[0] ?? null;
  };

  const addSaidaRow = () => {
    setSaidaRows((rows) => (rows.length >= MAX_SAIDA_ROWS ? rows : [...rows, makeEmptyRow()]));
  };

  const removeSaidaRow = (localId: string) => {
    setSaidaRows((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.localId !== localId)));
  };

  const updateSaidaRow = (localId: string, patch: Partial<SaidaRow>) => {
    setSaidaRows((rows) => rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const selectedItemIds = saidaRows.map((r) => r.itemId).filter(Boolean);

  const handleSubmitEntrada = async (e: React.FormEvent) => {
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

  const handleSubmitSaida = async (e: React.FormEvent) => {
    e.preventDefault();

    const validRows = saidaRows.filter((r) => r.itemId && parseFloat(r.quantity) > 0);
    if (validRows.length === 0) {
      toast.error('Escolha ao menos um item e informe uma quantidade válida.');
      return;
    }
    const hasIncompleteRow = saidaRows.some(
      (r) => (r.itemId || r.quantity) && !(r.itemId && parseFloat(r.quantity) > 0)
    );
    if (hasIncompleteRow) {
      toast.error('Há linha(s) incompletas (item ou quantidade faltando) — preencha ou remova antes de continuar.');
      return;
    }

    setIsSubmittingBatch(true);
    const succeeded: { name: string; quantity: number; unit?: string }[] = [];
    const failed: { name: string; error: string }[] = [];

    // Uma requisição por linha, em sequência: um item com problema (ex:
    // estoque insuficiente) não pode travar a saída dos demais itens do
    // mesmo atendimento.
    for (const row of validRows) {
      const item = items.find((i) => i.id === row.itemId);
      const qty = parseFloat(row.quantity);
      try {
        await createMutation.mutateAsync({
          itemId: row.itemId,
          movementType: 'saida',
          quantity: qty,
          destination: destination || null,
          responsible: null,
          supplier: null,
          invoiceNumber: null,
          purchaseOrder: null,
          unitPrice: null,
          notes: areaUso || null,
        });
        succeeded.push({ name: item?.name ?? row.itemId, quantity: qty, unit: item?.unit });
      } catch (error) {
        failed.push({
          name: item?.name ?? row.itemId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }
    setIsSubmittingBatch(false);

    if (failed.length > 0) {
      toast.error(
        `${succeeded.length} item(ns) registrado(s), mas ${failed.length} falharam: ${failed
          .map((f) => `${f.name} (${f.error})`)
          .join(', ')}`,
        { duration: 12000 }
      );
    } else {
      toast.success(`${succeeded.length} item(ns) de saída registrado(s)!`);
    }

    if (succeeded.length > 0 && destination) {
      printReceipt({
        title: 'Termo de Retirada de Material',
        employeeName: destination,
        items: succeeded,
        areaUso: areaUso || null,
      });
    }

    reset();
    await Promise.all([utils.warehouse.listItems.invalidate(), utils.warehouse.listMovements.invalidate()]);
  };

  const isBusy = createMutation.isPending || isSubmittingBatch;
  const filledRowsCount = saidaRows.filter((r) => r.itemId).length;

  return (
    <div>
      {canManage && (
        <form
          onSubmit={movementType === 'saida' ? handleSubmitSaida : handleSubmitEntrada}
          className="mb-5 p-4 rounded-xl border border-border bg-muted/30 space-y-3"
        >
          {!fixedType && (
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
          )}

          {movementType === 'saida' ? (
            <>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-foreground">
                  Itens ({saidaRows.length})
                </label>
                {saidaRows.map((row) => {
                  const lastWithdrawal = lastWithdrawalFor(row.itemId);
                  const rowItem = items.find((i) => i.id === row.itemId);
                  return (
                    <div key={row.localId} className="p-2.5 rounded-lg border border-border bg-background/40 space-y-1.5">
                      <div className="flex gap-1.5 items-start">
                        <WarehouseItemCombobox
                          items={items}
                          value={row.itemId}
                          onChange={(id) => updateSaidaRow(row.localId, { itemId: id })}
                          disabledIds={selectedItemIds}
                        />
                        <button
                          type="button"
                          onClick={() => setQrReaderFor({ kind: 'item', rowId: row.localId })}
                          title="Ler QR code do item"
                          className="shrink-0 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-orange hover:border-orange transition"
                        >
                          <QrCode size={16} />
                        </button>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Qtd."
                          value={row.quantity}
                          onChange={(e) => updateSaidaRow(row.localId, { quantity: e.target.value })}
                          className="w-24 shrink-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                        />
                        <button
                          type="button"
                          onClick={() => removeSaidaRow(row.localId)}
                          disabled={saidaRows.length === 1}
                          title="Remover esta linha"
                          className="shrink-0 px-2.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-danger hover:border-danger transition disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {lastWithdrawal && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground pl-0.5">
                          <Clock size={11} />
                          Última retirada: {new Date(lastWithdrawal.date).toLocaleDateString('pt-BR')}
                          {lastWithdrawal.destination && <> · {lastWithdrawal.destination}</>}
                          {' '}({lastWithdrawal.quantity} {rowItem?.unit})
                        </p>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addSaidaRow}
                  disabled={saidaRows.length >= MAX_SAIDA_ROWS}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border border-dashed border-border text-muted-foreground hover:text-orange hover:border-orange transition disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Plus size={15} />
                  Adicionar outro item
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Destino / quem retirou</label>
                <div className="flex gap-1.5">
                  <input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setQrReaderFor({ kind: 'employee' })}
                    title="Ler QR code do colaborador"
                    className="shrink-0 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-orange hover:border-orange transition"
                  >
                    <QrCode size={16} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Área de uso</label>
                <input
                  value={areaUso}
                  onChange={(e) => setAreaUso(e.target.value)}
                  placeholder="Ex: Manutenção, Almoxarifado, Obra 3..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Item</label>
                <div className="flex gap-1.5">
                  <WarehouseItemCombobox items={items} value={itemId} onChange={setItemId} />
                  <button
                    type="button"
                    onClick={() => setQrReaderFor({ kind: 'item', rowId: null })}
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
            </>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className={`w-full rounded-lg py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 ${
              movementType === 'saida' ? 'bg-danger' : 'bg-teal'
            }`}
          >
            {isBusy
              ? 'Registrando...'
              : movementType === 'saida'
                ? `Registrar saída${filledRowsCount > 1 ? ` (${filledRowsCount} itens)` : ''}`
                : 'Registrar entrada'}
          </button>
        </form>
      )}

      {(() => {
        const filtered = fixedType
          ? (movementsQuery.data ?? []).filter((m) => m.movementType === fixedType)
          : movementsQuery.data ?? [];
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
          </>
        );
      })()}

      {qrReaderFor && <QrCodeReader onScan={handleQrScan} onClose={() => setQrReaderFor(null)} />}
    </div>
  );
}
