/*
 * Design: Industrial Blueprint — Neo-Industrial
 * InvoiceWarehouseReconcilePanel: depois de lançar uma nota fiscal de
 * Material de consumo/EPI ou Ferramentas, confere cada item da nota com o
 * que já existe cadastrado no Almoxarifado — o que já existe ganha
 * entrada de estoque (quantidade + valor da nota); o que não bate com
 * nada existente, pede confirmação pra cadastrar como item novo. Nunca
 * cadastra nem dá entrada sozinho sem a pessoa confirmar linha por linha.
 */

import { useMemo, useState } from 'react';
import { X, PackageSearch, PackagePlus, SkipForward, Loader, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import WarehouseItemCombobox from '@/components/WarehouseItemCombobox';
import { matchInvoiceItemToWarehouseItem } from '@/lib/warehouse-invoice-match';
import { WAREHOUSE_ITEM_TYPES, WAREHOUSE_ITEM_TYPE_LABELS, type WarehouseItemType } from '@shared/warehouse';
import type { InvoiceProduct } from '@shared/invoices';

interface InvoiceWarehouseReconcilePanelProps {
  invoiceNumber: string | null;
  supplier: string | null;
  category: string | null;
  products: InvoiceProduct[];
  onClose: () => void;
}

type RowMode = 'match' | 'new' | 'skip';

interface ReconcileRow {
  product: InvoiceProduct;
  mode: RowMode;
  matchedItemId: string;
  matchConfidence: 'exata' | 'provavel' | null;
  newCode: string;
  newType: WarehouseItemType;
  newUnit: string;
  newCa: string;
  newPatrimonio: string;
}

function guessDefaultType(category: string | null): WarehouseItemType {
  if (category === 'Ferramentas') return 'ferramenta';
  return 'material_consumo';
}

export default function InvoiceWarehouseReconcilePanel({
  invoiceNumber,
  supplier,
  category,
  products,
  onClose,
}: InvoiceWarehouseReconcilePanelProps) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const createMovementMutation = trpc.warehouse.createMovement.useMutation();
  const upsertItemMutation = trpc.warehouse.upsertItem.useMutation();

  const items = itemsQuery.data ?? [];

  const [rows, setRows] = useState<ReconcileRow[]>(() =>
    products.map((product) => {
      const match = matchInvoiceItemToWarehouseItem(
        product.name,
        items.map((i) => ({ id: i.id, name: i.name, code: i.code }))
      );
      return {
        product,
        mode: match ? 'match' : 'new',
        matchedItemId: match?.item.id ?? '',
        matchConfidence: match?.confidence ?? null,
        newCode: '',
        newType: guessDefaultType(category),
        newUnit: 'un',
        newCa: '',
        newPatrimonio: '',
      };
    })
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const updateRow = (index: number, patch: Partial<ReconcileRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const usedItemIds = useMemo(
    () => rows.filter((r) => r.mode === 'match' && r.matchedItemId).map((r) => r.matchedItemId),
    [rows]
  );

  const isRowReady = (row: ReconcileRow): boolean => {
    if (row.mode === 'skip') return true;
    if (row.mode === 'match') return !!row.matchedItemId;
    if (row.mode === 'new') {
      if (!row.newCode.trim()) return false;
      if (row.newType === 'epi' && !row.newCa.trim()) return false;
      if (row.newType === 'ferramenta' && !row.newPatrimonio.trim()) return false;
      return true;
    }
    return false;
  };

  const allReady = rows.every(isRowReady);

  const handleConfirm = async () => {
    setIsProcessing(true);
    const succeeded: string[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const row of rows) {
      if (row.mode === 'skip') continue;
      try {
        if (row.mode === 'match') {
          await createMovementMutation.mutateAsync({
            itemId: row.matchedItemId,
            movementType: 'entrada',
            quantity: row.product.qty,
            unitPrice: row.product.unit_price || null,
            supplier: supplier || null,
            invoiceNumber: invoiceNumber || null,
            notes: 'Entrada automática pela conferência de Nota Fiscal',
          });
        } else {
          await upsertItemMutation.mutateAsync({
            code: row.newCode.trim(),
            name: row.product.name,
            type: row.newType,
            unit: row.newUnit.trim() || 'un',
            quantity: row.product.qty,
            precoUnitario: row.product.unit_price || 0,
            fornecedor: supplier || null,
            ca: row.newType === 'epi' ? row.newCa.trim() : null,
            patrimonio: row.newType === 'ferramenta' ? row.newPatrimonio.trim() : null,
            estoqueMinimo: 10,
          });
        }
        succeeded.push(row.product.name);
      } catch (error) {
        failed.push({ name: row.product.name, error: error instanceof Error ? error.message : 'erro desconhecido' });
      }
    }

    setIsProcessing(false);

    if (failed.length > 0) {
      toast.error(
        `${succeeded.length} item(ns) atualizado(s), mas ${failed.length} falharam: ${failed
          .map((f) => `${f.name} (${f.error})`)
          .join(', ')}`,
        { duration: 12000 }
      );
    } else if (succeeded.length > 0) {
      toast.success(`${succeeded.length} item(ns) do Almoxarifado atualizado(s)!`);
    }

    await Promise.all([utils.warehouse.listItems.invalidate(), utils.warehouse.listMovements.invalidate()]);
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <p className="flex items-center gap-2 font-display text-base font-bold text-foreground">
            <PackageSearch size={18} className="text-orange" />
            Conferir itens com o Almoxarifado
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={40} className="text-teal" />
            <p className="text-sm text-foreground">Conferência concluída.</p>
            <button onClick={onClose} className="mt-2 px-4 py-2 rounded-lg bg-orange text-white text-sm font-semibold hover:opacity-90">
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <p className="text-xs text-muted-foreground">
                {rows.length} item(ns) da nota. Pra cada um: já existe no estoque (só confirme ou troque o item
                certo) ou é novo (preencha o cadastro básico) — ou pule se não for pra entrar no Almoxarifado.
              </p>

              {rows.map((row, i) => (
                <div key={i} className="border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{row.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Qtd: {row.product.qty} · Vlr. unit: R$ {row.product.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateRow(i, { mode: 'match' })}
                        title="Já existe no Almoxarifado"
                        className={`p-1.5 rounded-lg border ${row.mode === 'match' ? 'bg-teal/10 border-teal text-teal' : 'border-border text-muted-foreground'}`}
                      >
                        <PackageSearch size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(i, { mode: 'new' })}
                        title="Cadastrar como item novo"
                        className={`p-1.5 rounded-lg border ${row.mode === 'new' ? 'bg-orange/10 border-orange text-orange' : 'border-border text-muted-foreground'}`}
                      >
                        <PackagePlus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(i, { mode: 'skip' })}
                        title="Pular esse item"
                        className={`p-1.5 rounded-lg border ${row.mode === 'skip' ? 'bg-muted border-foreground/30 text-foreground' : 'border-border text-muted-foreground'}`}
                      >
                        <SkipForward size={14} />
                      </button>
                    </div>
                  </div>

                  {row.mode === 'match' && (
                    <div>
                      {row.matchConfidence && row.matchedItemId && (
                        <p className="text-[11px] text-teal mb-1">
                          {row.matchConfidence === 'exata' ? 'Correspondência exata encontrada' : 'Correspondência provável — confira'}
                        </p>
                      )}
                      {!row.matchedItemId && (
                        <p className="text-[11px] text-muted-foreground mb-1">
                          Não encontrei automaticamente — busque o item certo:
                        </p>
                      )}
                      <WarehouseItemCombobox
                        items={items}
                        value={row.matchedItemId}
                        onChange={(id) => updateRow(i, { matchedItemId: id })}
                        disabledIds={usedItemIds.filter((id) => id !== row.matchedItemId)}
                        placeholder="Buscar item do Almoxarifado..."
                      />
                    </div>
                  )}

                  {row.mode === 'new' && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-orange">Não encontrado — confirme os dados pra cadastrar:</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-0.5">Tipo</label>
                          <select
                            value={row.newType}
                            onChange={(e) => updateRow(i, { newType: e.target.value as WarehouseItemType })}
                            className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                          >
                            {WAREHOUSE_ITEM_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {WAREHOUSE_ITEM_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-0.5">Código *</label>
                          <input
                            value={row.newCode}
                            onChange={(e) => updateRow(i, { newCode: e.target.value })}
                            placeholder="Código único"
                            className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground mb-0.5">Unidade</label>
                          <input
                            value={row.newUnit}
                            onChange={(e) => updateRow(i, { newUnit: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                          />
                        </div>
                        {row.newType === 'epi' && (
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-0.5">CA *</label>
                            <input
                              value={row.newCa}
                              onChange={(e) => updateRow(i, { newCa: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                            />
                          </div>
                        )}
                        {row.newType === 'ferramenta' && (
                          <div>
                            <label className="block text-[10px] text-muted-foreground mb-0.5">Patrimônio *</label>
                            <input
                              value={row.newPatrimonio}
                              onChange={(e) => updateRow(i, { newPatrimonio: e.target.value })}
                              className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border shrink-0">
              <button
                onClick={handleConfirm}
                disabled={!allReady || isProcessing}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-semibold text-white bg-orange hover:opacity-90 disabled:opacity-50 transition"
              >
                {isProcessing ? (
                  <>
                    <Loader size={15} className="animate-spin" /> Atualizando o Almoxarifado...
                  </>
                ) : (
                  'Confirmar e atualizar o Almoxarifado'
                )}
              </button>
              {!allReady && (
                <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                  Preencha ou escolha "pular" em todas as linhas antes de confirmar.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
