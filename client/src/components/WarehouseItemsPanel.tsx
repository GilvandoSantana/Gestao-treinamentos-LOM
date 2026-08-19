/*
 * Design: Industrial Blueprint — Neo-Industrial
 * WarehouseItemsPanel: cadastro e consulta de itens em estoque do
 * almoxarifado — migrado de um sistema separado (Vercel + Supabase).
 */

import { useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, X, Search, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import DateInputBR from '@/components/DateInputBR';
import WarehouseMigrationPanel from '@/components/WarehouseMigrationPanel';
import {
  WAREHOUSE_ITEM_TYPES,
  WAREHOUSE_ITEM_TYPE_LABELS,
  type WarehouseItemType,
  type WarehouseItemInfo,
} from '@shared/warehouse';

interface WarehouseItemsPanelProps {
  canManage: boolean;
  isMasterAdmin?: boolean;
}

const emptyForm = {
  code: '',
  name: '',
  type: 'material_consumo' as WarehouseItemType,
  unit: 'un',
  quantity: '0',
  ca: '',
  dataValidadeCa: '',
  patrimonio: '',
  estoqueMinimo: '10',
  localizacao: '',
  fornecedor: '',
  precoUnitario: '0',
  dataValidade: '',
};

export default function WarehouseItemsPanel({ canManage, isMasterAdmin }: WarehouseItemsPanelProps) {
  const utils = trpc.useUtils();
  const itemsQuery = trpc.warehouse.listItems.useQuery();
  const upsertMutation = trpc.warehouse.upsertItem.useMutation();
  const deleteMutation = trpc.warehouse.deleteItem.useMutation();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  const filtered = useMemo(() => {
    let list = itemsQuery.data ?? [];
    if (filterType) list = list.filter((i) => i.type === filterType);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q));
    }
    return list;
  }, [itemsQuery.data, search, filterType]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (item: WarehouseItemInfo) => {
    setEditingId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      type: item.type,
      unit: item.unit,
      quantity: String(item.quantity),
      ca: item.ca ?? '',
      dataValidadeCa: item.dataValidadeCa ?? '',
      patrimonio: item.patrimonio ?? '',
      estoqueMinimo: String(item.estoqueMinimo),
      localizacao: item.localizacao ?? '',
      fornecedor: item.fornecedor ?? '',
      precoUnitario: String(item.precoUnitario),
      dataValidade: item.dataValidade ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Informe código e nome.');
      return;
    }
    if (form.type === 'epi' && !form.ca.trim()) {
      toast.error('Para EPI é obrigatório informar o número do CA.');
      return;
    }
    if (form.type === 'ferramenta' && !form.patrimonio.trim()) {
      toast.error('Para Ferramenta é obrigatório informar o Patrimônio.');
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        id: editingId ?? undefined,
        code: form.code,
        name: form.name,
        type: form.type,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        ca: form.ca || null,
        dataValidadeCa: form.dataValidadeCa || null,
        patrimonio: form.patrimonio || null,
        estoqueMinimo: parseFloat(form.estoqueMinimo) || 0,
        localizacao: form.localizacao || null,
        fornecedor: form.fornecedor || null,
        precoUnitario: parseFloat(form.precoUnitario) || 0,
        dataValidade: form.dataValidade || null,
      });
      toast.success(editingId ? 'Item atualizado.' : 'Item cadastrado.');
      resetForm();
      await utils.warehouse.listItems.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar item.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Excluir o item "${name}"? Não é possível desfazer.`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success('Item excluído.');
      await utils.warehouse.listItems.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir item.');
    }
  };

  return (
    <div>
      {/* Busca e filtro */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
        >
          <option value="">Todos os tipos</option>
          {WAREHOUSE_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {WAREHOUSE_ITEM_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {isMasterAdmin && (itemsQuery.data?.length ?? 0) === 0 && !itemsQuery.isLoading && (
        <WarehouseMigrationPanel />
      )}

      {canManage && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mb-4 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-orange hover:text-orange transition text-sm font-semibold"
        >
          <Plus size={16} />
          Novo item
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 p-4 rounded-xl border border-border bg-muted/30 space-y-3 max-w-2xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {editingId ? 'Editar item' : 'Novo item'}
            </p>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Código *</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="EX001"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Tipo *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as WarehouseItemType })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              >
                {WAREHOUSE_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WAREHOUSE_ITEM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Unidade</label>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="un, cx, kg..."
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Quantidade</label>
              <input
                type="number"
                step="0.01"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Estoque mínimo</label>
              <input
                type="number"
                step="0.01"
                value={form.estoqueMinimo}
                onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          {form.type === 'epi' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">CA *</label>
                <input
                  value={form.ca}
                  onChange={(e) => setForm({ ...form, ca: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Validade do CA</label>
                <DateInputBR
                  value={form.dataValidadeCa}
                  onChange={(v) => setForm({ ...form, dataValidadeCa: v })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
                />
              </div>
            </div>
          )}

          {form.type === 'ferramenta' && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Patrimônio *</label>
              <input
                value={form.patrimonio}
                onChange={(e) => setForm({ ...form, patrimonio: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Localização</label>
              <input
                value={form.localizacao}
                onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Fornecedor</label>
              <input
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Preço unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.precoUnitario}
                onChange={(e) => setForm({ ...form, precoUnitario: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Validade geral</label>
              <DateInputBR
                value={form.dataValidade}
                onChange={(v) => setForm({ ...form, dataValidade: v })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={upsertMutation.isPending}
            className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {upsertMutation.isPending ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar item'}
          </button>
        </form>
      )}

      {/* Lista */}
      {itemsQuery.isLoading && (
        <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
      )}
      {itemsQuery.data?.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum item cadastrado ainda.
        </p>
      )}

      {/* Tabela — telas médias pra cima, aproveita o espaço da tela maior */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs font-technical uppercase text-muted-foreground">
              <th className="px-3 py-2.5">Código</th>
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5 text-right">Qtd.</th>
              <th className="px-3 py-2.5">Localização</th>
              <th className="px-3 py-2.5">Fornecedor</th>
              <th className="px-3 py-2.5 text-right">Preço</th>
              {canManage && <th className="px-3 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const low = item.quantity <= item.estoqueMinimo;
              return (
                <tr key={item.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-technical text-muted-foreground whitespace-nowrap">
                    {item.code}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground font-medium">{item.name}</span>
                      {low && (
                        <span
                          title={`Estoque baixo (mínimo: ${item.estoqueMinimo})`}
                          className="text-danger shrink-0"
                        >
                          <AlertTriangle size={13} />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="text-[11px] font-technical uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {WAREHOUSE_ITEM_TYPE_LABELS[item.type]}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-technical whitespace-nowrap ${
                      low ? 'text-danger font-semibold' : 'text-foreground'
                    }`}
                  >
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[140px]">
                    {item.localizacao || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[140px]">
                    {item.fornecedor || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-technical whitespace-nowrap text-foreground">
                    {item.precoUnitario > 0
                      ? item.precoUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1.5 text-muted-foreground hover:text-orange transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="p-1.5 text-danger hover:opacity-70 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cartões — só no celular */}
      <div className="md:hidden space-y-2">
        {filtered.map((item) => {
          const low = item.quantity <= item.estoqueMinimo;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                  <span className="text-[10px] font-technical uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    {WAREHOUSE_ITEM_TYPE_LABELS[item.type]}
                  </span>
                  {low && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                      <AlertTriangle size={10} />
                      Estoque baixo
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground font-technical">
                  {item.code} · {item.quantity} {item.unit}
                  {item.localizacao && <> · {item.localizacao}</>}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(item)}
                    className="p-2 text-muted-foreground hover:text-orange transition-colors"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id, item.name)}
                    className="p-2 text-danger hover:opacity-70 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
