/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EpiRoleConfigModal: define, por função, quais EPIs já saem prontos na
 * Ficha de EPI de quem exerce aquela função — quantidade, especificação,
 * CA e responsável pela entrega. Cada contrato tem sua própria lista.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, HardHat, Plus, Trash2, Loader, Save, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PREDEFINED_ROLES } from '@/lib/types';

interface EpiRoleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DraftItem {
  key: string;
  quantity: number;
  specification: string;
  ca: string;
  responsibleName: string;
}

let keyCounter = 0;
const newKey = () => `item-${Date.now()}-${keyCounter++}`;

export default function EpiRoleConfigModal({ isOpen, onClose }: EpiRoleConfigModalProps) {
  const [selectedRole, setSelectedRole] = useState('');
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const utils = trpc.useUtils();
  const customRolesQuery = trpc.roles.list.useQuery(undefined, { enabled: isOpen });
  const countsQuery = trpc.epiConfig.countByRole.useQuery(undefined, { enabled: isOpen });
  const suggestionsQuery = trpc.epiConfig.responsibleSuggestions.useQuery(undefined, { enabled: isOpen });
  const itemsQuery = trpc.epiConfig.listByRole.useQuery(
    { role: selectedRole },
    { enabled: isOpen && !!selectedRole }
  );
  const saveMutation = trpc.epiConfig.saveForRole.useMutation();

  const allRoles = useMemo(
    () =>
      [...PREDEFINED_ROLES, ...(customRolesQuery.data?.map((r) => r.name) ?? [])].sort((a, b) =>
        a.localeCompare(b)
      ),
    [customRolesQuery.data]
  );

  // Popula o rascunho quando os itens da função escolhida chegam do servidor.
  useEffect(() => {
    if (!selectedRole) {
      setDraft([]);
      return;
    }
    if (itemsQuery.data) {
      setDraft(
        itemsQuery.data.map((item) => ({
          key: newKey(),
          quantity: item.quantity,
          specification: item.specification,
          ca: item.ca ?? '',
          responsibleName: item.responsibleName ?? '',
        }))
      );
      setIsDirty(false);
    }
  }, [itemsQuery.data, selectedRole]);

  const handleSelectRole = (role: string) => {
    if (isDirty && !confirm('Você tem alterações não salvas nesta função. Trocar de função e perder as alterações?')) {
      return;
    }
    setSelectedRole(role);
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setDraft((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setIsDirty(true);
  };

  const addItem = () => {
    setDraft((prev) => [...prev, { key: newKey(), quantity: 1, specification: '', ca: '', responsibleName: '' }]);
    setIsDirty(true);
  };

  const removeItem = (key: string) => {
    setDraft((prev) => prev.filter((item) => item.key !== key));
    setIsDirty(true);
  };

  const handleSave = async () => {
    const invalid = draft.some((item) => !item.specification.trim());
    if (invalid) {
      toast.error('Todo item precisa ter uma especificação (nome do EPI).');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        role: selectedRole,
        items: draft.map((item) => ({
          quantity: item.quantity,
          specification: item.specification.trim(),
          ca: item.ca.trim() || null,
          responsibleName: item.responsibleName.trim() || null,
        })),
      });
      await Promise.all([
        utils.epiConfig.listByRole.invalidate({ role: selectedRole }),
        utils.epiConfig.countByRole.invalidate(),
        utils.epiConfig.responsibleSuggestions.invalidate(),
      ]);
      setIsDirty(false);
      toast.success(`EPIs de "${selectedRole}" salvos.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  };

  const handleClose = () => {
    if (isDirty && !confirm('Você tem alterações não salvas. Fechar mesmo assim?')) return;
    setSelectedRole('');
    setDraft([]);
    setIsDirty(false);
    onClose();
  };

  if (!isOpen) return null;

  const responsibleOptions = suggestionsQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <HardHat className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">EPIs por Função</h2>
              <p className="text-xs text-muted-foreground">
                Define o que já sai pronto na Ficha de EPI de cada função
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        {/* Escolha da função */}
        <div className="p-4 pb-2">
          <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Função</label>
          <div className="relative">
            <select
              value={selectedRole}
              onChange={(e) => handleSelectRole(e.target.value)}
              className="w-full appearance-none border-2 border-input rounded-lg p-3 pr-9 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
            >
              <option value="">Selecione uma função</option>
              {allRoles.map((role) => {
                const count = countsQuery.data?.[role] ?? 0;
                return (
                  <option key={role} value={role}>
                    {role} {count > 0 ? `(${count} EPI${count !== 1 ? 's' : ''} configurado${count !== 1 ? 's' : ''})` : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {!selectedRole ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Escolha uma função acima para ver ou editar seus EPIs padrão.
            </p>
          </div>
        ) : itemsQuery.isLoading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <Loader size={22} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
              {draft.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum EPI configurado ainda para "{selectedRole}" — a Ficha de EPI sai em branco até adicionar
                  algum item aqui.
                </p>
              )}
              {draft.map((item) => (
                <div key={item.key} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-16 shrink-0 border-2 border-input rounded-lg p-2 text-sm text-center focus:border-orange focus:outline-none bg-background text-foreground"
                      title="Quantidade"
                    />
                    <input
                      type="text"
                      value={item.specification}
                      onChange={(e) => updateItem(item.key, { specification: e.target.value })}
                      placeholder="Especificação do EPI (ex: LUVA DE VAQUETA)"
                      className="flex-1 min-w-0 border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground uppercase"
                    />
                    <button
                      onClick={() => removeItem(item.key)}
                      className="shrink-0 text-muted-foreground hover:text-danger p-2"
                      title="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={item.ca}
                      onChange={(e) => updateItem(item.key, { ca: e.target.value })}
                      placeholder="CA (opcional)"
                      className="w-28 shrink-0 border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground"
                    />
                    <input
                      type="text"
                      list="epi-responsible-suggestions"
                      value={item.responsibleName}
                      onChange={(e) => updateItem(item.key, { responsibleName: e.target.value })}
                      placeholder="Responsável pela entrega (opcional)"
                      className="flex-1 min-w-0 border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground"
                    />
                  </div>
                </div>
              ))}
              <datalist id="epi-responsible-suggestions">
                {responsibleOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              <button
                onClick={addItem}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold py-2.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-orange hover:border-orange transition"
              >
                <Plus size={15} />
                Adicionar EPI
              </button>
            </div>

            <div className="p-4 border-t border-border">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending || !isDirty}
                className="w-full flex items-center justify-center gap-2 bg-orange text-white rounded-xl py-3 font-bold hover:opacity-90 disabled:opacity-50 transition"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader size={17} className="animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save size={17} />
                    {isDirty ? `Salvar EPIs de "${selectedRole}"` : 'Nada para salvar'}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
