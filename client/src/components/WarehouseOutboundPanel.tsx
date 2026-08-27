/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseOutboundPanel: uma única tela pra tirar qualquer coisa do
 * estoque num atendimento — materiais de consumo, EPIs, ferramentas,
 * misturados na mesma lista.
 *
 * Por baixo, ainda são dois fluxos diferentes (o servidor exige isso):
 *  - Ferramenta → vira um EMPRÉSTIMO rastreado (tabela toolDeliveries,
 *    aparece em "Ferramentas por Funcionário" e some do estoque disponível
 *    até alguém devolver em "Devolução de Ferramentas"). Exige um
 *    colaborador cadastrado de verdade (não aceita texto livre) e mostra o
 *    patrimônio da ferramenta, que já é obrigatório desde o cadastro do
 *    item — não dá pra tirar uma ferramenta sem patrimônio registrado.
 *  - Qualquer outro tipo → baixa definitiva de estoque (tabela
 *    warehouseMovements), igual à saída de material de sempre.
 * Cada linha manda a requisição certa pro servidor, em sequência, então um
 * item com problema não trava os demais itens do mesmo atendimento.
 */

import { useMemo, useState } from 'react';
import { ArrowUpCircle, Loader, QrCode, Clock, Plus, Trash2, UserCheck, Search, Wrench } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import QrCodeReader from '@/components/QrCodeReader';
import WarehouseItemCombobox from '@/components/WarehouseItemCombobox';
import { printReceipt } from '@/lib/warehouse-print';

interface WarehouseOutboundPanelProps {
  canManage: boolean;
}

interface OutboundRow {
  localId: string;
  itemId: string;
  quantity: string;
}

const MAX_ROWS = 30;

function makeEmptyRow(): OutboundRow {
  return { localId: crypto.randomUUID(), itemId: '', quantity: '' };
}

type QrTarget = { kind: 'employee' } | { kind: 'item'; rowId: string };

export default function WarehouseOutboundPanel({ canManage }: WarehouseOutboundPanelProps) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const movementsQuery = trpc.warehouse.listMovements.useQuery();
  const deliveriesQuery = trpc.warehouse.listDeliveries.useQuery();
  const employeesQuery = trpc.employees.list.useQuery();
  const createMovementMutation = trpc.warehouse.createMovement.useMutation();
  const deliverItemMutation = trpc.warehouse.deliverItem.useMutation();

  const [rows, setRows] = useState<OutboundRow[]>([makeEmptyRow()]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [areaUso, setAreaUso] = useState('');
  const [qrReaderFor, setQrReaderFor] = useState<QrTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const items = itemsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees.slice(0, 30);
    const q = employeeSearch.trim().toLowerCase();
    return employees
      .filter((e) => e.name.toLowerCase().includes(q) || e.registration?.toLowerCase().includes(q))
      .slice(0, 30);
  }, [employees, employeeSearch]);

  const selectEmployee = (id: string, name: string) => {
    setSelectedEmployeeId(id);
    setEmployeeSearch(name);
  };

  const handleQrScan = (value: string) => {
    if (!qrReaderFor) return;

    if (qrReaderFor.kind === 'employee') {
      const code = value.replace(/^FUNC:/, '');
      const found = employees.find(
        (e) => e.registration === code || e.name.toUpperCase().replace(/\s+/g, '_') === code
      );
      if (found) {
        selectEmployee(found.id, found.name);
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
    setRows((prev) => prev.map((r) => (r.localId === qrReaderFor.rowId ? { ...r, itemId: found.id } : r)));
    toast.success(`Item identificado: ${found.name}`);
    setQrReaderFor(null);
  };

  const reset = () => {
    setRows([makeEmptyRow()]);
    setEmployeeSearch('');
    setSelectedEmployeeId('');
    setAreaUso('');
  };

  const lastMovementFor = (forItemId: string) => {
    if (!forItemId) return null;
    const movementMatches = (movementsQuery.data ?? [])
      .filter((m) => m.itemId === forItemId && m.movementType === 'saida')
      .map((m) => ({ date: m.date, who: m.destination }));
    const deliveryMatches = (deliveriesQuery.data ?? [])
      .filter((d) => d.itemId === forItemId)
      .map((d) => ({ date: d.deliveredAt, who: d.employeeName }));
    const all = [...movementMatches, ...deliveryMatches].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return all[0] ?? null;
  };

  const addRow = () => setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, makeEmptyRow()]));
  const removeRow = (localId: string) =>
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.localId !== localId)));
  const updateRow = (localId: string, patch: Partial<OutboundRow>) =>
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));

  const selectedItemIds = rows.map((r) => r.itemId).filter(Boolean);
  const hasToolRow = rows.some((r) => items.find((i) => i.id === r.itemId)?.type === 'ferramenta');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validRows = rows.filter((r) => r.itemId && parseFloat(r.quantity) > 0);
    if (validRows.length === 0) {
      toast.error('Escolha ao menos um item e informe uma quantidade válida.');
      return;
    }
    const hasIncompleteRow = rows.some((r) => (r.itemId || r.quantity) && !(r.itemId && parseFloat(r.quantity) > 0));
    if (hasIncompleteRow) {
      toast.error('Há linha(s) incompletas (item ou quantidade faltando) — preencha ou remova antes de continuar.');
      return;
    }
    if (hasToolRow && !selectedEmployeeId) {
      toast.error(
        'Pra tirar ferramenta é preciso selecionar um colaborador cadastrado na lista (não vale texto livre) — é assim que o sistema rastreia quem precisa devolver.'
      );
      return;
    }

    setIsSubmitting(true);
    const succeeded: { name: string; quantity: number; unit?: string; patrimonio?: string | null }[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const row of validRows) {
      const item = items.find((i) => i.id === row.itemId);
      const qty = parseFloat(row.quantity);
      const isTool = item?.type === 'ferramenta';
      try {
        if (isTool) {
          if (!item?.patrimonio) {
            throw new Error('item sem patrimônio cadastrado — edite o item em Controle de Estoque antes de retirar');
          }
          await deliverItemMutation.mutateAsync({
            employeeId: selectedEmployeeId,
            employeeName: selectedEmployee!.name,
            itemId: row.itemId,
            quantity: qty,
            obs: areaUso || null,
          });
        } else {
          await createMovementMutation.mutateAsync({
            itemId: row.itemId,
            movementType: 'saida',
            quantity: qty,
            destination: selectedEmployee?.name || employeeSearch || null,
            responsible: null,
            supplier: null,
            invoiceNumber: null,
            purchaseOrder: null,
            unitPrice: null,
            notes: areaUso || null,
          });
        }
        succeeded.push({ name: item?.name ?? row.itemId, quantity: qty, unit: item?.unit, patrimonio: item?.patrimonio });
      } catch (error) {
        failed.push({
          name: item?.name ?? row.itemId,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }
    setIsSubmitting(false);

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

    const receiptName = selectedEmployee?.name || employeeSearch;
    if (succeeded.length > 0 && receiptName) {
      printReceipt({
        title: hasToolRow ? 'Termo de Retirada — Material e Ferramentas' : 'Termo de Retirada de Material',
        employeeName: receiptName,
        items: succeeded.map((s) => ({
          name: s.patrimonio ? `${s.name} (Patrimônio: ${s.patrimonio})` : s.name,
          quantity: s.quantity,
          unit: s.unit,
        })),
        areaUso: areaUso || null,
        obs: hasToolRow ? 'Ferramenta(s) devem ser devolvidas — ver aba Devolução de Ferramentas.' : null,
      });
    }

    reset();
    await Promise.all([
      utils.warehouse.listItems.invalidate(),
      utils.warehouse.listMovements.invalidate(),
      utils.warehouse.listDeliveries.invalidate(),
    ]);
  };

  const isBusy = isSubmitting || createMovementMutation.isPending || deliverItemMutation.isPending;
  const filledRowsCount = rows.filter((r) => r.itemId).length;

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        Você não tem permissão para dar saída em material ou entregar ferramentas.
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-xl border border-border bg-muted/30 space-y-3">
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-foreground">Itens ({rows.length})</label>
          {rows.map((row) => {
            const rowItem = items.find((i) => i.id === row.itemId);
            const isTool = rowItem?.type === 'ferramenta';
            const lastOne = lastMovementFor(row.itemId);
            return (
              <div key={row.localId} className="p-2.5 rounded-lg border border-border bg-background/40 space-y-1.5">
                <div className="flex gap-1.5 items-start">
                  <WarehouseItemCombobox
                    items={items}
                    value={row.itemId}
                    onChange={(id) => updateRow(row.localId, { itemId: id })}
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
                    onChange={(e) => updateRow(row.localId, { quantity: e.target.value })}
                    className="w-24 shrink-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.localId)}
                    disabled={rows.length === 1}
                    title="Remover esta linha"
                    className="shrink-0 px-2.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-danger hover:border-danger transition disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {isTool && (
                  <p className="flex items-center gap-1 text-xs pl-0.5">
                    <Wrench size={11} className="text-orange shrink-0" />
                    {rowItem?.patrimonio ? (
                      <span className="text-foreground">
                        Ferramenta — Patrimônio: <strong>{rowItem.patrimonio}</strong> · vira empréstimo, precisa
                        devolver depois
                      </span>
                    ) : (
                      <span className="text-danger font-semibold">
                        Ferramenta sem patrimônio cadastrado — edite o item antes de retirar
                      </span>
                    )}
                  </p>
                )}
                {!isTool && lastOne && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground pl-0.5">
                    <Clock size={11} />
                    Última retirada: {new Date(lastOne.date).toLocaleDateString('pt-BR')}
                    {lastOne.who && <> · {lastOne.who}</>}
                  </p>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_ROWS}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border border-dashed border-border text-muted-foreground hover:text-orange hover:border-orange transition disabled:opacity-40 disabled:pointer-events-none"
          >
            <Plus size={15} />
            Adicionar outro item
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
            <UserCheck size={13} />
            Colaborador / destino
            {hasToolRow && <span className="text-danger">*</span>}
          </label>
          <div className="flex gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setSelectedEmployeeId('');
                }}
                placeholder={
                  hasToolRow ? 'Buscar colaborador cadastrado (obrigatório p/ ferramenta)' : 'Nome, área, ou buscar colaborador'
                }
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
              />
            </div>
            <button
              type="button"
              onClick={() => setQrReaderFor({ kind: 'employee' })}
              title="Ler QR code do colaborador"
              className="shrink-0 px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-orange hover:border-orange transition"
            >
              <QrCode size={16} />
            </button>
          </div>
          {employeeSearch && !selectedEmployeeId && (
            <div className="mt-1.5 max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {filteredEmployees.length === 0 && (
                <p className="text-xs text-muted-foreground p-2.5">
                  {hasToolRow
                    ? 'Nenhum colaborador cadastrado encontrado — obrigatório para retirar ferramenta.'
                    : 'Nenhum colaborador encontrado (tudo bem, pode digitar livremente se não for ferramenta).'}
                </p>
              )}
              {filteredEmployees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => selectEmployee(emp.id, emp.name)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  {emp.name}
                  {emp.registration && <span className="text-muted-foreground"> · Mat. {emp.registration}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Área de uso / observação</label>
          <input
            value={areaUso}
            onChange={(e) => setAreaUso(e.target.value)}
            placeholder="Ex: Manutenção, Almoxarifado, Obra 3..."
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
          />
        </div>

        <button
          type="submit"
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 bg-danger"
        >
          <ArrowUpCircle size={16} />
          {isBusy
            ? 'Registrando...'
            : `Registrar saída${filledRowsCount > 1 ? ` (${filledRowsCount} itens)` : ''}`}
        </button>
      </form>

      {(() => {
        const materialOut = (movementsQuery.data ?? []).filter((m) => m.movementType === 'saida');
        const toolOut = deliveriesQuery.data ?? [];
        const combined = [
          ...materialOut.map((m) => ({
            id: `mov-${m.id}`,
            itemName: m.itemName,
            quantity: m.quantity,
            date: m.date,
            who: m.destination,
            isTool: false as const,
            status: undefined as string | undefined,
          })),
          ...toolOut.map((d) => ({
            id: `del-${d.id}`,
            itemName: d.itemName,
            quantity: d.quantity,
            date: d.deliveredAt,
            who: d.employeeName,
            isTool: true as const,
            status: d.status as string | undefined,
          })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return (
          <>
            <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Histórico ({combined.length})
            </p>
            {(movementsQuery.isLoading || deliveriesQuery.isLoading) && (
              <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
                <Loader size={14} className="animate-spin" /> Carregando...
              </p>
            )}
            {!movementsQuery.isLoading && !deliveriesQuery.isLoading && combined.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma saída ainda.</p>
            )}
            <div className="space-y-1.5">
              {combined.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="p-1.5 rounded-lg shrink-0 bg-danger/10 text-danger">
                      {m.isTool ? <Wrench size={14} /> : <ArrowUpCircle size={14} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <strong>{m.itemName}</strong> — {m.quantity}
                        {m.isTool && (
                          <span
                            className={`ml-1.5 text-[10px] font-technical uppercase px-1.5 py-0.5 rounded ${
                              m.status === 'devolvido' ? 'bg-teal/10 text-teal' : 'bg-orange/10 text-orange'
                            }`}
                          >
                            {m.status === 'devolvido' ? 'devolvido' : 'com o colaborador'}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {new Date(m.date).toLocaleString('pt-BR')}
                        {m.who && <> · {m.who}</>}
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
