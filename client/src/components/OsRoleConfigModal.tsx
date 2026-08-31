/*
 * Design: Industrial Blueprint — Neo-Industrial
 * OsRoleConfigModal: define, por função, o conteúdo que preenche a Ordem de
 * Serviço (NR-01) de quem exerce aquela função — área, tarefas, agentes
 * ambientais, medidas de controle e EPIs mínimos. Cada contrato tem sua
 * própria configuração (mesmo padrão do EpiRoleConfigModal).
 */

import { useEffect, useMemo, useState } from 'react';
import { X, ClipboardList, Loader, Save, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { PREDEFINED_ROLES } from '@/lib/types';

interface OsRoleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Draft {
  area: string;
  setorTrabalho: string;
  maquinasEquipamentos: string;
  tarefas: string;
  agentesFisicos: string;
  agentesQuimicos: string;
  agentesBiologicos: string;
  agentesErgonomicos: string;
  agentesAcidentes: string;
  medidasAdministrativas: string;
  medidasEngenharia: string;
  episMinimos: string;
}

const EMPTY_DRAFT: Draft = {
  area: '',
  setorTrabalho: '',
  maquinasEquipamentos: '',
  tarefas: '',
  agentesFisicos: '',
  agentesQuimicos: '',
  agentesBiologicos: '',
  agentesErgonomicos: '',
  agentesAcidentes: '',
  medidasAdministrativas: '',
  medidasEngenharia: '',
  episMinimos: '',
};

const FIELDS: { key: keyof Draft; label: string; placeholder?: string; rows?: number }[] = [
  { key: 'area', label: 'Área' },
  { key: 'setorTrabalho', label: 'Setor de Trabalho' },
  { key: 'maquinasEquipamentos', label: 'Máquinas, Equipamentos e Ferramentas', rows: 2 },
  { key: 'tarefas', label: 'Descrição das atividades / Tarefas', rows: 4 },
  { key: 'agentesFisicos', label: 'Agentes Físicos', rows: 2 },
  { key: 'agentesQuimicos', label: 'Agentes Químicos', rows: 2 },
  { key: 'agentesBiologicos', label: 'Agentes Biológicos', rows: 2, placeholder: 'Ex: NA.' },
  { key: 'agentesErgonomicos', label: 'Agentes Ergonômicos', rows: 2 },
  { key: 'agentesAcidentes', label: 'Agentes de Acidentes', rows: 2 },
  { key: 'medidasAdministrativas', label: 'Medidas Administrativas', rows: 3 },
  { key: 'medidasEngenharia', label: 'Medidas de Engenharia', rows: 2 },
  { key: 'episMinimos', label: "EPI's Mínimos", rows: 3 },
];

export default function OsRoleConfigModal({ isOpen, onClose }: OsRoleConfigModalProps) {
  const [selectedRole, setSelectedRole] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isDirty, setIsDirty] = useState(false);

  const utils = trpc.useUtils();
  const customRolesQuery = trpc.roles.list.useQuery(undefined, { enabled: isOpen });
  const countsQuery = trpc.osConfig.countByRole.useQuery(undefined, { enabled: isOpen });
  const configQuery = trpc.osConfig.getByRole.useQuery(
    { role: selectedRole },
    { enabled: isOpen && !!selectedRole }
  );
  const saveMutation = trpc.osConfig.saveForRole.useMutation();

  const allRoles = useMemo(
    () =>
      [...PREDEFINED_ROLES, ...(customRolesQuery.data?.map((r) => r.name) ?? [])].sort((a, b) =>
        a.localeCompare(b)
      ),
    [customRolesQuery.data]
  );

  // Popula o rascunho quando a configuração da função escolhida chega do servidor.
  useEffect(() => {
    if (!selectedRole) {
      setDraft(EMPTY_DRAFT);
      return;
    }
    if (configQuery.data !== undefined) {
      const data = configQuery.data;
      setDraft(
        data
          ? {
              area: data.area ?? '',
              setorTrabalho: data.setorTrabalho ?? '',
              maquinasEquipamentos: data.maquinasEquipamentos ?? '',
              tarefas: data.tarefas ?? '',
              agentesFisicos: data.agentesFisicos ?? '',
              agentesQuimicos: data.agentesQuimicos ?? '',
              agentesBiologicos: data.agentesBiologicos ?? '',
              agentesErgonomicos: data.agentesErgonomicos ?? '',
              agentesAcidentes: data.agentesAcidentes ?? '',
              medidasAdministrativas: data.medidasAdministrativas ?? '',
              medidasEngenharia: data.medidasEngenharia ?? '',
              episMinimos: data.episMinimos ?? '',
            }
          : EMPTY_DRAFT
      );
      setIsDirty(false);
    }
  }, [configQuery.data, selectedRole]);

  const handleSelectRole = (role: string) => {
    if (isDirty && !confirm('Você tem alterações não salvas nesta função. Trocar de função e perder as alterações?')) {
      return;
    }
    setSelectedRole(role);
  };

  const updateField = (key: keyof Draft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ role: selectedRole, ...draft });
      await Promise.all([
        utils.osConfig.getByRole.invalidate({ role: selectedRole }),
        utils.osConfig.countByRole.invalidate(),
      ]);
      setIsDirty(false);
      toast.success(`Ordem de Serviço de "${selectedRole}" salva.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  };

  const handleClose = () => {
    if (isDirty && !confirm('Você tem alterações não salvas. Fechar mesmo assim?')) return;
    setSelectedRole('');
    setDraft(EMPTY_DRAFT);
    setIsDirty(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <ClipboardList className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Ordem de Serviço por Função</h2>
              <p className="text-xs text-muted-foreground">
                Define o que sai pronto na Ordem de Serviço de cada função
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
                const configured = countsQuery.data?.[role];
                return (
                  <option key={role} value={role}>
                    {role} {configured ? '(configurada)' : ''}
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
              Escolha uma função acima para ver ou editar a Ordem de Serviço dela.
            </p>
          </div>
        ) : configQuery.isLoading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <Loader size={22} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIELDS.slice(0, 2).map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
                    <input
                      type="text"
                      value={draft[key]}
                      onChange={(e) => updateField(key, e.target.value)}
                      className="w-full border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground"
                    />
                  </div>
                ))}
              </div>
              {FIELDS.slice(2).map(({ key, label, placeholder, rows }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">{label}</label>
                  <textarea
                    value={draft[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    placeholder={placeholder}
                    rows={rows ?? 2}
                    className="w-full border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground resize-y"
                  />
                </div>
              ))}
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
                    {isDirty ? `Salvar OS de "${selectedRole}"` : 'Nada para salvar'}
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
