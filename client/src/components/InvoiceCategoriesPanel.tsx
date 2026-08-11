/*
 * InvoiceCategoriesPanel: cadastro de categorias de Nota Fiscal —
 * nome + cor, com categorias padrão do sistema protegidas contra exclusão.
 */

import { useState } from 'react';
import { Plus, Trash2, Tag, Pencil, Check, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { INVOICE_CATEGORY_COLORS } from '@shared/invoices';

interface InvoiceCategoriesPanelProps {
  canManage: boolean;
}

export default function InvoiceCategoriesPanel({ canManage }: InvoiceCategoriesPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(INVOICE_CATEGORY_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  const utils = trpc.useUtils();
  const listQuery = trpc.invoices.categories.list.useQuery();
  const createMutation = trpc.invoices.categories.create.useMutation();
  const updateMutation = trpc.invoices.categories.update.useMutation();
  const deleteMutation = trpc.invoices.categories.delete.useMutation();

  const resetForm = () => {
    setName('');
    setColor(INVOICE_CATEGORY_COLORS[0]);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (cat: { id: string; name: string; color: string }) => {
    setEditingId(cat.id);
    setName(cat.name);
    setColor(cat.color);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome da categoria.');
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, name: name.trim(), color });
      } else {
        await createMutation.mutateAsync({ name: name.trim(), color });
      }
      toast.success(editingId ? 'Categoria atualizada!' : 'Categoria criada!');
      resetForm();
      await utils.invoices.categories.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a categoria');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (cat: { id: string; name: string; isDefault: boolean }) => {
    if (cat.isDefault) {
      toast.error('Categorias padrão do sistema não podem ser excluídas.');
      return;
    }
    if (!window.confirm(`Excluir a categoria "${cat.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync({ id: cat.id });
      toast.success('Categoria excluída.');
      await utils.invoices.categories.list.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir');
    }
  };

  return (
    <>
      <p className="text-xs text-muted-foreground px-1 pb-2">
        {listQuery.data?.length ?? 0} categoria(s) cadastrada(s)
      </p>

      <div className="grid grid-cols-2 gap-2">
        {listQuery.data?.map((cat) => (
          <div key={cat.id} className="group border border-border rounded-xl p-3">
            <div className="flex items-start justify-between">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${cat.color}20` }}
              >
                <Tag className="w-4 h-4" style={{ color: cat.color }} />
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button onClick={() => startEdit(cat)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                    <Pencil className="w-3 h-3" />
                  </button>
                  {!cat.isDefault && (
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-1 rounded hover:bg-danger/10 text-danger"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <p className="font-medium text-foreground text-sm mt-2 truncate">{cat.name}</p>
            {cat.isDefault && <span className="text-[10px] text-muted-foreground">Padrão do sistema</span>}
          </div>
        ))}
      </div>

      {canManage && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mt-4 bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Nova categoria
        </button>
      )}

      {canManage && showForm && (
        <form onSubmit={handleSubmit} className="border-t border-border mt-4 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {editingId ? 'Editar categoria' : 'Nova categoria'}
            </p>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Nome <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Combustível"
              disabled={isSaving}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange text-sm"
            />
          </div>

          <div>
            <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Cor
            </label>
            <div className="flex flex-wrap gap-2">
              {INVOICE_CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                >
                  {color === c && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-orange text-white rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      )}
    </>
  );
}
