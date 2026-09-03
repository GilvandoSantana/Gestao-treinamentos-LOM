/*
 * Design: Industrial Blueprint — Neo-Industrial
 * OsRoleConfigModal: define, por função, o conteúdo que preenche a Ordem de
 * Serviço (NR-01) de quem exerce aquela função — área, tarefas e agentes
 * ambientais. "Medidas de Controle Existentes" (Administrativas,
 * Engenharia, EPI's Mínimos) fica numa seção separada, fixa por CONTRATO
 * (mesmo texto pra todas as funções, configurado uma vez). Cada contrato
 * tem sua própria configuração (mesmo padrão do EpiRoleConfigModal).
 */

import { useEffect, useMemo, useState } from 'react';
import { X, ClipboardList, Loader, Save, ChevronDown, Sparkles, ShieldCheck } from 'lucide-react';
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
};

const FIELDS: { key: keyof Draft; label: string; placeholder?: string; rows?: number; hint?: string }[] = [
  { key: 'area', label: 'Área' },
  {
    key: 'setorTrabalho',
    label: 'Setor de Trabalho',
    hint: 'Preenchimento manual — a IA não preenche este campo.',
  },
  { key: 'maquinasEquipamentos', label: 'Máquinas, Equipamentos e Ferramentas', rows: 2 },
  { key: 'tarefas', label: 'Descrição das atividades / Tarefas', rows: 4 },
  { key: 'agentesFisicos', label: 'Agentes Físicos', rows: 2 },
  { key: 'agentesQuimicos', label: 'Agentes Químicos', rows: 2 },
  { key: 'agentesBiologicos', label: 'Agentes Biológicos', rows: 2, placeholder: "Ex: NA., se não houver exposição" },
  { key: 'agentesErgonomicos', label: 'Agentes Ergonômicos', rows: 2 },
  { key: 'agentesAcidentes', label: 'Agentes de Acidentes', rows: 2 },
];

// Todos os campos são obrigatórios — não é possível salvar a OS de uma
// função sem preencher tudo.
function getMissingFieldLabels(draft: Draft): string[] {
  return FIELDS.filter((f) => draft[f.key].trim().length === 0).map((f) => f.label);
}

interface ContractDefaultsDraft {
  osMedidasAdministrativas: string;
  osMedidasEngenharia: string;
  osEpisMinimos: string;
}

const EMPTY_CONTRACT_DEFAULTS: ContractDefaultsDraft = {
  osMedidasAdministrativas: '',
  osMedidasEngenharia: '',
  osEpisMinimos: '',
};

const CONTRACT_DEFAULTS_FIELDS: { key: keyof ContractDefaultsDraft; label: string; rows?: number }[] = [
  { key: 'osMedidasAdministrativas', label: 'Medidas Administrativas', rows: 3 },
  { key: 'osMedidasEngenharia', label: 'Medidas de Engenharia', rows: 2 },
  { key: 'osEpisMinimos', label: "EPI's Mínimos", rows: 3 },
];

function getMissingContractDefaultsLabels(draft: ContractDefaultsDraft): string[] {
  return CONTRACT_DEFAULTS_FIELDS.filter((f) => draft[f.key].trim().length === 0).map((f) => f.label);
}

export default function OsRoleConfigModal({ isOpen, onClose }: OsRoleConfigModalProps) {
  const [selectedRole, setSelectedRole] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isDirty, setIsDirty] = useState(false);

  const [contractDefaultsDraft, setContractDefaultsDraft] = useState<ContractDefaultsDraft>(EMPTY_CONTRACT_DEFAULTS);
  const [isContractDefaultsDirty, setIsContractDefaultsDirty] = useState(false);
  const [showContractDefaults, setShowContractDefaults] = useState(false);

  const utils = trpc.useUtils();
  const customRolesQuery = trpc.roles.list.useQuery(undefined, { enabled: isOpen });
  const countsQuery = trpc.osConfig.countByRole.useQuery(undefined, { enabled: isOpen });
  const configQuery = trpc.osConfig.getByRole.useQuery(
    { role: selectedRole },
    { enabled: isOpen && !!selectedRole }
  );
  const saveMutation = trpc.osConfig.saveForRole.useMutation();
  const extractMutation = trpc.osConfig.extractFromPgr.useMutation();

  const contractDefaultsQuery = trpc.osConfig.getContractDefaults.useQuery(undefined, { enabled: isOpen });
  const saveContractDefaultsMutation = trpc.osConfig.saveContractDefaults.useMutation();

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
            }
          : EMPTY_DRAFT
      );
      setIsDirty(false);
    }
  }, [configQuery.data, selectedRole]);

  // Popula o rascunho do padrão do contrato quando ele chega do servidor.
  useEffect(() => {
    if (contractDefaultsQuery.data !== undefined) {
      const data = contractDefaultsQuery.data;
      setContractDefaultsDraft({
        osMedidasAdministrativas: data?.osMedidasAdministrativas ?? '',
        osMedidasEngenharia: data?.osMedidasEngenharia ?? '',
        osEpisMinimos: data?.osEpisMinimos ?? '',
      });
      setIsContractDefaultsDirty(false);
    }
  }, [contractDefaultsQuery.data]);

  const contractDefaultsConfigured =
    !!contractDefaultsQuery.data?.osMedidasAdministrativas?.trim() &&
    !!contractDefaultsQuery.data?.osMedidasEngenharia?.trim() &&
    !!contractDefaultsQuery.data?.osEpisMinimos?.trim();

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

  const updateContractDefaultsField = (key: keyof ContractDefaultsDraft, value: string) => {
    setContractDefaultsDraft((prev) => ({ ...prev, [key]: value }));
    setIsContractDefaultsDirty(true);
  };

  const handleSave = async () => {
    const missing = getMissingFieldLabels(draft);
    if (missing.length > 0) {
      toast.error(`Preencha todos os campos antes de salvar. Faltando: ${missing.join(', ')}.`);
      return;
    }
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

  const handleSaveContractDefaults = async () => {
    const missing = getMissingContractDefaultsLabels(contractDefaultsDraft);
    if (missing.length > 0) {
      toast.error(`Preencha todos os campos antes de salvar. Faltando: ${missing.join(', ')}.`);
      return;
    }
    try {
      await saveContractDefaultsMutation.mutateAsync(contractDefaultsDraft);
      await utils.osConfig.getContractDefaults.invalidate();
      setIsContractDefaultsDirty(false);
      toast.success('Medidas de Controle Existentes (padrão do contrato) salvas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar.');
    }
  };

  const handleExtractFromPgr = async () => {
    if (!selectedRole) return;
    if (
      (Object.entries(draft).some(([key, v]) => key !== 'setorTrabalho' && v.trim().length > 0) || isDirty) &&
      !confirm(
        'Isso vai substituir o que está preenchido nos campos abaixo pelo que a IA encontrar no PGR (exceto "Setor de Trabalho", que é sempre manual). Continuar?'
      )
    ) {
      return;
    }
    try {
      const extracted = await extractMutation.mutateAsync({ role: selectedRole });
      // "Setor de Trabalho" nunca vem da IA — mantém o que já estava digitado.
      setDraft((prev) => ({
        ...prev,
        area: extracted.area,
        maquinasEquipamentos: extracted.maquinasEquipamentos,
        tarefas: extracted.tarefas,
        agentesFisicos: extracted.agentesFisicos,
        agentesQuimicos: extracted.agentesQuimicos,
        agentesBiologicos: extracted.agentesBiologicos,
        agentesErgonomicos: extracted.agentesErgonomicos,
        agentesAcidentes: extracted.agentesAcidentes,
      }));
      setIsDirty(true);
      toast.success('Dados extraídos do PGR. Revise os campos (e preencha o Setor de Trabalho) antes de salvar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao extrair dados do PGR.');
    }
  };

  const handleClose = () => {
    if (isDirty && !confirm('Você tem alterações não salvas na função. Fechar mesmo assim?')) return;
    if (isContractDefaultsDirty && !confirm('Você tem alterações não salvas no padrão do contrato. Fechar mesmo assim?')) return;
    setSelectedRole('');
    setDraft(EMPTY_DRAFT);
    setIsDirty(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="relative bg-gradient-to-r from-navy to-navy-light p-5 pt-6">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-3.5 h-3.5 rounded-full bg-background border border-black/10" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <ClipboardList className="text-orange-light shrink-0" size={21} />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-white truncate">Ordem de Serviço por Função</h2>
                <p className="text-xs text-white/60">
                  Define o que sai pronto na Ordem de Serviço de cada função
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="text-white/60 hover:text-white shrink-0">
              <X size={23} />
            </button>
          </div>
        </div>
        <div className="h-0 border-t border-dashed border-border/70" aria-hidden="true" />

        <div className="flex-1 overflow-y-auto">
          {/* Padrão do contrato — Medidas de Controle Existentes, fixo pra todas as funções */}
          <div className="p-4 border-b border-border">
            <button
              onClick={() => setShowContractDefaults((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck size={16} className={contractDefaultsConfigured ? 'text-teal shrink-0' : 'text-warning shrink-0'} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Medidas de Controle Existentes (padrão do contrato)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Mesmo texto pra todas as funções deste contrato — configure uma vez só.
                    {!contractDefaultsConfigured && ' Ainda não configurado.'}
                  </p>
                </div>
              </div>
              <ChevronDown
                size={16}
                className={`text-muted-foreground shrink-0 transition-transform ${showContractDefaults ? 'rotate-180' : ''}`}
              />
            </button>

            {showContractDefaults && (
              <div className="mt-3 space-y-3">
                {contractDefaultsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader size={18} className="animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {CONTRACT_DEFAULTS_FIELDS.map(({ key, label, rows }) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">
                          {label} <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={contractDefaultsDraft[key]}
                          onChange={(e) => updateContractDefaultsField(key, e.target.value)}
                          rows={rows ?? 2}
                          className="w-full border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground resize-y"
                        />
                      </div>
                    ))}
                    <button
                      onClick={handleSaveContractDefaults}
                      disabled={saveContractDefaultsMutation.isPending}
                      className="w-full flex items-center justify-center gap-2 bg-navy text-white rounded-lg py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {saveContractDefaultsMutation.isPending ? (
                        <>
                          <Loader size={15} className="animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save size={15} />
                          Salvar padrão do contrato
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
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
            <div className="flex items-center justify-center p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Escolha uma função acima para ver ou editar a Ordem de Serviço dela.
              </p>
            </div>
          ) : configQuery.isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader size={22} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="px-4 pt-1 pb-2">
                <button
                  onClick={handleExtractFromPgr}
                  disabled={extractMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 border-2 border-orange text-orange rounded-lg py-2 text-sm font-semibold hover:bg-orange/10 disabled:opacity-50 transition"
                >
                  {extractMutation.isPending ? (
                    <>
                      <Loader size={15} className="animate-spin" />
                      Lendo o PGR e extraindo os dados...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      Extrair dados do PGR para "{selectedRole}"
                    </>
                  )}
                </button>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                  A IA lê o PGR anexado no contrato e preenche os campos abaixo (exceto "Setor de Trabalho",
                  sempre manual). Revise antes de salvar.
                </p>
              </div>

              <div className="px-4 py-2 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FIELDS.slice(0, 2).map(({ key, label, hint }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">
                        {label} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={draft[key]}
                        onChange={(e) => updateField(key, e.target.value)}
                        className="w-full border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground"
                      />
                      {hint && <p className="text-[10.5px] text-muted-foreground mt-1">{hint}</p>}
                    </div>
                  ))}
                </div>
                {FIELDS.slice(2).map(({ key, label, placeholder, rows }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">
                      {label} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={draft[key]}
                      onChange={(e) => updateField(key, e.target.value)}
                      placeholder={placeholder}
                      rows={rows ?? 2}
                      className="w-full border-2 border-input rounded-lg p-2 text-sm focus:border-orange focus:outline-none bg-background text-foreground resize-y"
                    />
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1">
                  <span className="text-red-500">*</span> Todos os campos são obrigatórios para salvar.
                </p>
              </div>

              <div className="p-4 border-t border-border">
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
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
                      {`Salvar OS de "${selectedRole}"`}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
