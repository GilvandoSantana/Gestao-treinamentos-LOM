/*
 * Design: Industrial Blueprint — Neo-Industrial
 * RolesTrainingTypesModal: o administrador cadastra funções extras e tipos
 * de treinamento (com validade em meses) — exclusivo dele, compartilhado
 * entre todos os contratos.
 */

import { useState } from 'react';
import { X, UserCog, Shield, Plus, Trash2, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PREDEFINED_ROLES, PREDEFINED_TRAININGS } from '@/lib/types';

interface RolesTrainingTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'roles' | 'trainings';

export default function RolesTrainingTypesModal({ isOpen, onClose }: RolesTrainingTypesModalProps) {
  const [tab, setTab] = useState<Tab>('roles');

  const utils = trpc.useUtils();
  const rolesQuery = trpc.roles.list.useQuery(undefined, { enabled: isOpen });
  const trainingTypesQuery = trpc.trainingTypes.list.useQuery(undefined, { enabled: isOpen });

  const createRoleMutation = trpc.roles.create.useMutation();
  const deleteRoleMutation = trpc.roles.delete.useMutation();
  const createTrainingTypeMutation = trpc.trainingTypes.create.useMutation();
  const updateTrainingTypeMutation = trpc.trainingTypes.update.useMutation();
  const deleteTrainingTypeMutation = trpc.trainingTypes.delete.useMutation();

  const [newRoleName, setNewRoleName] = useState('');
  const [newTrainingName, setNewTrainingName] = useState('');
  const [newTrainingValidity, setNewTrainingValidity] = useState('12');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editValidity, setEditValidity] = useState('');

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      await createRoleMutation.mutateAsync({ name: newRoleName });
      setNewRoleName('');
      await utils.roles.list.invalidate();
      toast.success('Função adicionada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar função.');
    }
  };

  const handleDeleteRole = async (id: string, name: string) => {
    if (!window.confirm(`Remover a função "${name}" do catálogo?`)) return;
    try {
      await deleteRoleMutation.mutateAsync({ id });
      await utils.roles.list.invalidate();
      toast.success('Função removida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover função.');
    }
  };

  const handleAddTrainingType = async () => {
    const validity = parseInt(newTrainingValidity, 10);
    if (!newTrainingName.trim() || !validity || validity < 1) {
      toast.error('Informe o nome e uma validade válida (em meses).');
      return;
    }
    try {
      await createTrainingTypeMutation.mutateAsync({ name: newTrainingName, validityMonths: validity });
      setNewTrainingName('');
      setNewTrainingValidity('12');
      await utils.trainingTypes.list.invalidate();
      toast.success('Tipo de treinamento adicionado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar treinamento.');
    }
  };

  const startEditValidity = (id: string, currentValidity: number) => {
    setEditingTypeId(id);
    setEditValidity(String(currentValidity));
  };

  const handleSaveValidity = async (id: string, name: string) => {
    const validity = parseInt(editValidity, 10);
    if (!validity || validity < 1) {
      toast.error('Informe uma validade válida (em meses).');
      return;
    }
    try {
      await updateTrainingTypeMutation.mutateAsync({ id, name, validityMonths: validity });
      setEditingTypeId(null);
      await utils.trainingTypes.list.invalidate();
      toast.success('Validade atualizada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar.');
    }
  };

  const handleDeleteTrainingType = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Excluir "${name}" do catálogo? Colaboradores que já têm esse treinamento continuam com o registro, mas ele deixa de aparecer para escolha.`
      )
    )
      return;
    try {
      await deleteTrainingTypeMutation.mutateAsync({ id });
      await utils.trainingTypes.list.invalidate();
      toast.success('Tipo de treinamento excluído.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <UserCog className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">
                Funções e Treinamentos
              </h2>
              <p className="text-xs text-muted-foreground">Catálogo usado em todos os contratos</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          <button
            onClick={() => setTab('roles')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'roles'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            Funções
          </button>
          <button
            onClick={() => setTab('trainings')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'trainings'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            <Shield size={14} />
            Tipos de Treinamento
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'roles' ? (
            <>
              <div className="flex gap-2 mb-4">
                <input
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Nova função (ex: Almoxarife)"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                />
                <button
                  onClick={handleAddRole}
                  disabled={createRoleMutation.isPending || !newRoleName.trim()}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <Plus size={15} />
                  Adicionar
                </button>
              </div>

              <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Cadastradas por você ({rolesQuery.data?.length ?? 0})
              </p>
              {rolesQuery.data?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma função extra cadastrada ainda.
                </p>
              )}
              <div className="space-y-1.5 mb-5">
                {rolesQuery.data?.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30"
                  >
                    <span className="text-sm text-foreground">{r.name}</span>
                    <button
                      onClick={() => handleDeleteRole(r.id, r.name)}
                      className="text-danger hover:opacity-70"
                      title="Remover"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Já vêm prontas no sistema ({PREDEFINED_ROLES.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PREDEFINED_ROLES.map((r) => (
                  <span
                    key={r}
                    className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <input
                  value={newTrainingName}
                  onChange={(e) => setNewTrainingName(e.target.value)}
                  placeholder="Nome do treinamento (ex: NR-35)"
                  className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                />
                <input
                  type="number"
                  min={1}
                  value={newTrainingValidity}
                  onChange={(e) => setNewTrainingValidity(e.target.value)}
                  placeholder="Meses"
                  className="w-20 shrink-0 px-2 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                />
              </div>
              <button
                onClick={handleAddTrainingType}
                disabled={createTrainingTypeMutation.isPending || !newTrainingName.trim()}
                className="w-full mb-4 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-orange text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                <Plus size={15} />
                Adicionar tipo de treinamento
              </button>

              <p className="text-xs text-muted-foreground mb-3">
                A validade em meses define o vencimento automaticamente (ex: 24 meses = data de
                realização + 2 anos). Só o que está listado aqui pode ser escolhido ao cadastrar um
                treinamento de colaborador.
              </p>

              <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Catálogo completo ({trainingTypesQuery.data?.length ?? 0})
              </p>
              <div className="space-y-1.5">
                {trainingTypesQuery.data?.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30"
                  >
                    <span className="text-sm text-foreground truncate">
                      {t.name}
                      {(PREDEFINED_TRAININGS as readonly string[]).includes(t.name) && (
                        <span className="text-[10px] text-muted-foreground ml-1.5">(padrão)</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {editingTypeId === t.id ? (
                        <>
                          <input
                            type="number"
                            min={1}
                            value={editValidity}
                            onChange={(e) => setEditValidity(e.target.value)}
                            autoFocus
                            className="w-16 px-2 py-1 text-sm border border-border rounded-lg bg-background text-foreground"
                          />
                          <span className="text-xs text-muted-foreground">meses</span>
                          <button
                            onClick={() => handleSaveValidity(t.id, t.name)}
                            className="text-teal hover:opacity-70"
                            title="Salvar"
                          >
                            <Check size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-technical text-muted-foreground">
                            {t.validityMonths} {t.validityMonths === 1 ? 'mês' : 'meses'}
                          </span>
                          <button
                            onClick={() => startEditValidity(t.id, t.validityMonths)}
                            className="text-muted-foreground hover:text-orange"
                            title="Editar validade"
                          >
                            <Pencil size={14} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteTrainingType(t.id, t.name)}
                        className="text-danger hover:opacity-70"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
