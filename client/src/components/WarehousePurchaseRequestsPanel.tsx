/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehousePurchaseRequestsPanel: solicitações de compra do almoxarifado —
 * uma solicitação pode ter vários itens de uma vez.
 */

import { useState } from 'react';
import { ShoppingCart, Plus, Trash2, X, ArrowRight, Ban } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  PURCHASE_REQUEST_PRIORITIES,
  PURCHASE_REQUEST_PRIORITY_LABELS,
  PURCHASE_REQUEST_STATUS_LABELS,
  PURCHASE_REQUEST_NEXT_STATUS,
  type PurchaseRequestPriority,
  type PurchaseRequestItem,
} from '@shared/warehouse';

interface WarehousePurchaseRequestsPanelProps {
  canManage: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-warning/10 text-warning',
  aprovada: 'bg-navy/10 text-navy',
  em_processo: 'bg-orange/10 text-orange',
  concluida: 'bg-teal/10 text-teal',
  cancelada: 'bg-muted text-muted-foreground',
  expirada: 'bg-danger/10 text-danger',
};

const PRIORITY_COLORS: Record<PurchaseRequestPriority, string> = {
  baixa: 'text-muted-foreground',
  normal: 'text-foreground',
  alta: 'text-orange',
  urgente: 'text-danger',
  emergencial: 'text-danger font-bold',
};

const emptyItem: PurchaseRequestItem = { name: '', quantity: 1, fornecedor: '', priority: 'normal' };

export default function WarehousePurchaseRequestsPanel({ canManage }: WarehousePurchaseRequestsPanelProps) {
  const utils = trpc.useUtils();
  const requestsQuery = trpc.warehouse.listPurchaseRequests.useQuery();
  const createMutation = trpc.warehouse.createPurchaseRequest.useMutation();
  const updateStatusMutation = trpc.warehouse.updatePurchaseRequestStatus.useMutation();
  const cancelMutation = trpc.warehouse.cancelPurchaseRequest.useMutation();
  const deleteMutation = trpc.warehouse.deletePurchaseRequest.useMutation();

  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState<PurchaseRequestItem[]>([{ ...emptyItem }]);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const resetForm = () => {
    setItems([{ ...emptyItem }]);
    setShowForm(false);
  };

  const updateItem = (index: number, patch: Partial<PurchaseRequestItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const handleSubmit = async () => {
    const valid = items.filter((it) => it.name.trim() && it.quantity > 0);
    if (valid.length === 0) {
      toast.error('Adicione pelo menos um item com nome e quantidade.');
      return;
    }
    try {
      const created = await createMutation.mutateAsync({ items: valid });
      toast.success(`Solicitação ${created.registro} criada.`);
      resetForm();
      await utils.warehouse.listPurchaseRequests.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar solicitação.');
    }
  };

  const handleAdvance = async (id: string, nextStatus: string) => {
    try {
      await updateStatusMutation.mutateAsync({ id, status: nextStatus as any });
      toast.success('Status atualizado.');
      await utils.warehouse.listPurchaseRequests.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar.');
    }
  };

  const handleCancel = async (id: string) => {
    if (!cancelReason.trim()) {
      toast.error('Informe o motivo do cancelamento.');
      return;
    }
    try {
      await cancelMutation.mutateAsync({ id, reason: cancelReason });
      toast.success('Solicitação cancelada.');
      setCancelingId(null);
      setCancelReason('');
      await utils.warehouse.listPurchaseRequests.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao cancelar.');
    }
  };

  const handleDelete = async (id: string, registro: string) => {
    if (!window.confirm(`Excluir a solicitação ${registro}? Não é possível desfazer.`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('Solicitação excluída.');
      await utils.warehouse.listPurchaseRequests.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir.');
    }
  };

  return (
    <div className="max-w-3xl">
      {canManage && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mb-4 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-orange hover:text-orange transition text-sm font-semibold"
        >
          <Plus size={16} />
          Nova solicitação de compra
        </button>
      )}

      {showForm && (
        <div className="mb-5 p-4 rounded-xl border border-border bg-muted/30 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <ShoppingCart size={15} />
              Nova solicitação
            </p>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>

          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                {idx === 0 && <label className="block text-xs font-semibold text-foreground mb-1">Item</label>}
                <input
                  value={item.name}
                  onChange={(e) => updateItem(idx, { name: e.target.value })}
                  placeholder="Nome do item"
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                />
              </div>
              <div className="col-span-2">
                {idx === 0 && <label className="block text-xs font-semibold text-foreground mb-1">Qtd.</label>}
                <input
                  type="number"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                />
              </div>
              <div className="col-span-3">
                {idx === 0 && (
                  <label className="block text-xs font-semibold text-foreground mb-1">Fornecedor</label>
                )}
                <input
                  value={item.fornecedor ?? ''}
                  onChange={(e) => updateItem(idx, { fornecedor: e.target.value })}
                  className="w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                />
              </div>
              <div className="col-span-2">
                {idx === 0 && (
                  <label className="block text-xs font-semibold text-foreground mb-1">Prioridade</label>
                )}
                <select
                  value={item.priority}
                  onChange={(e) => updateItem(idx, { priority: e.target.value as PurchaseRequestPriority })}
                  className="w-full px-2 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                >
                  {PURCHASE_REQUEST_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PURCHASE_REQUEST_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  className="p-2 text-danger hover:opacity-70 disabled:opacity-30"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => setItems((prev) => [...prev, { ...emptyItem }])}
            className="text-xs font-semibold text-orange hover:opacity-80 flex items-center gap-1"
          >
            <Plus size={13} />
            Adicionar outro item
          </button>

          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Enviando...' : 'Criar solicitação'}
          </button>
        </div>
      )}

      {requestsQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nenhuma solicitação de compra ainda.
        </p>
      )}

      <div className="space-y-2">
        {requestsQuery.data?.map((req) => {
          const nextStatus = PURCHASE_REQUEST_NEXT_STATUS[req.status];
          const canAct = canManage && !['concluida', 'cancelada', 'expirada'].includes(req.status);
          return (
            <div key={req.id} className="p-3.5 rounded-xl border border-border bg-muted/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-technical text-sm font-bold text-foreground">{req.registro}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status]}`}>
                    {PURCHASE_REQUEST_STATUS_LABELS[req.status]}
                  </span>
                  <span className={`text-[11px] font-technical uppercase ${PRIORITY_COLORS[req.priority]}`}>
                    {PURCHASE_REQUEST_PRIORITY_LABELS[req.priority]}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(req.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>

              <ul className="mt-2 space-y-0.5">
                {req.items.map((it, i) => (
                  <li key={i} className="text-sm text-foreground">
                    <span className="font-medium">{it.quantity}×</span> {it.name}
                    {it.fornecedor && <span className="text-muted-foreground"> — {it.fornecedor}</span>}
                  </li>
                ))}
              </ul>

              {req.status === 'cancelada' && req.cancelReason && (
                <p className="text-xs text-danger mt-1.5">Motivo: {req.cancelReason}</p>
              )}

              {canAct && (
                <div className="flex items-center gap-2 mt-3">
                  {nextStatus && (
                    <button
                      onClick={() => handleAdvance(req.id, nextStatus)}
                      disabled={updateStatusMutation.isPending}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {PURCHASE_REQUEST_STATUS_LABELS[nextStatus]}
                      <ArrowRight size={12} />
                    </button>
                  )}
                  {cancelingId === req.id ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Motivo do cancelamento"
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground"
                      />
                      <button
                        onClick={() => handleCancel(req.id)}
                        className="text-xs font-semibold text-danger px-2 py-1.5"
                      >
                        Confirmar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancelingId(req.id)}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-danger hover:border-danger transition"
                    >
                      <Ban size={12} />
                      Cancelar
                    </button>
                  )}
                </div>
              )}

              {canManage && ['concluida', 'cancelada', 'expirada'].includes(req.status) && (
                <button
                  onClick={() => handleDelete(req.id, req.registro)}
                  className="mt-2 text-xs font-semibold text-muted-foreground hover:text-danger flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Excluir
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
