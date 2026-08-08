/*
 * Design: Industrial Blueprint — Neo-Industrial
 * ContractsModal: o administrador principal cadastra, edita e exclui
 * contratos por aqui. Exclusão é em duas etapas — primeiro vai para a lixeira
 * (reversível), depois pode ser apagada de vez, com confirmação nas duas.
 */

import { useState } from 'react';
import {
  X,
  Building2,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Loader,
  Trash,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import type { ContractInfo, ContractPreposition } from '@shared/contracts';

interface ContractsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'active' | 'trash' | 'overview';

/** Confirmação de exclusão (mover para lixeira ou apagar de vez). */
type PendingDelete = { contract: ContractInfo; permanent: boolean };

export default function ContractsModal({ isOpen, onClose }: ContractsModalProps) {
  const [tab, setTab] = useState<Tab>('active');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [preposition, setPreposition] = useState<ContractPreposition>('do');
  const [alertEmail, setAlertEmail] = useState('');
  const [alertWhatsapp, setAlertWhatsapp] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const utils = trpc.useUtils();
  const activeQuery = trpc.contracts.list.useQuery(
    { includeDeleted: false },
    { enabled: isOpen }
  );
  const trashQuery = trpc.contracts.list.useQuery(
    { includeDeleted: true },
    { enabled: isOpen && tab === 'trash' }
  );
  const trashed = (trashQuery.data ?? []).filter((c) => c.deleted);

  const overviewQuery = trpc.contracts.overview.useQuery(undefined, {
    enabled: isOpen && tab === 'overview',
  });

  const usageQuery = trpc.contracts.usage.useQuery(
    { id: pendingDelete?.contract.id ?? '' },
    { enabled: !!pendingDelete?.permanent }
  );

  const createMutation = trpc.contracts.create.useMutation();
  const updateMutation = trpc.contracts.update.useMutation();
  const deleteMutation = trpc.contracts.delete.useMutation();
  const restoreMutation = trpc.contracts.restore.useMutation();
  const permanentDeleteMutation = trpc.contracts.permanentDelete.useMutation();

  // Campos personalizados do contrato em edição.
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'date'>('text');
  const fieldsQuery = trpc.contracts.fields.list.useQuery(
    { contractSlug: editingSlug ?? undefined },
    { enabled: !!editingSlug }
  );
  const createFieldMutation = trpc.contracts.fields.create.useMutation();
  const deleteFieldMutation = trpc.contracts.fields.delete.useMutation();

  const handleAddField = async () => {
    if (!editingSlug || !newFieldLabel.trim()) return;
    try {
      await createFieldMutation.mutateAsync({
        contractSlug: editingSlug,
        label: newFieldLabel,
        fieldType: newFieldType,
      });
      setNewFieldLabel('');
      setNewFieldType('text');
      await utils.contracts.fields.list.invalidate();
      toast.success('Campo adicionado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar campo.');
    }
  };

  const handleDeleteField = async (id: string) => {
    if (!editingSlug) return;
    if (!window.confirm('Excluir este campo? Valores já preenchidos por colaboradores serão perdidos.')) return;
    try {
      await deleteFieldMutation.mutateAsync({ id, contractSlug: editingSlug });
      await utils.contracts.fields.list.invalidate();
      toast.success('Campo excluído.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir campo.');
    }
  };


  const refreshAll = async () => {
    await Promise.all([
      utils.contracts.list.invalidate(),
      utils.auth.siteSession.invalidate(),
    ]);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingSlug(null);
    setName('');
    setPreposition('do');
    setAlertEmail('');
    setAlertWhatsapp('');
  };

  const startEdit = (contract: ContractInfo) => {
    setEditingId(contract.id);
    setEditingSlug(contract.slug);
    setName(contract.name);
    setPreposition(contract.preposition);
    setAlertEmail(contract.alertEmail ?? '');
    setAlertWhatsapp(contract.alertWhatsapp ?? '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, name, preposition, alertEmail, alertWhatsapp });
        toast.success('Contrato atualizado.');
      } else {
        await createMutation.mutateAsync({ name, preposition, alertEmail, alertWhatsapp });
        toast.success('Contrato cadastrado.');
      }
      resetForm();
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o contrato.');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.permanent) {
        await permanentDeleteMutation.mutateAsync({ id: pendingDelete.contract.id });
        toast.success('Contrato excluído definitivamente.');
      } else {
        await deleteMutation.mutateAsync({ id: pendingDelete.contract.id });
        toast.success('Contrato movido para a lixeira.');
      }
      setPendingDelete(null);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir o contrato.');
    }
  };

  const handleRestore = async (contract: ContractInfo) => {
    try {
      await restoreMutation.mutateAsync({ id: contract.id });
      toast.success(`"${contract.name}" restaurado.`);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao restaurar.');
    }
  };

  if (!isOpen) return null;

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Building2 className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">Contratos</h2>
              <p className="text-xs text-muted-foreground">
                {tab === 'active'
                  ? `${activeQuery.data?.length ?? 0} contrato(s) ativo(s)`
                  : tab === 'trash'
                    ? `${trashed.length} na lixeira`
                    : 'Panorama de colaboradores e treinamentos'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex gap-2 px-4 pt-3">
          <button
            onClick={() => setTab('active')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'active'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            Ativos
          </button>
          <button
            onClick={() => setTab('trash')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'trash'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            <Trash size={14} />
            Excluídos
          </button>
          <button
            onClick={() => setTab('overview')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
              tab === 'overview'
                ? 'bg-navy text-white border-navy'
                : 'bg-card text-muted-foreground border-border hover:border-muted-foreground/40'
            }`}
          >
            <BarChart3 size={14} />
            Comparativo
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'active' ? (
            <>
              {activeQuery.isLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
                  <Loader size={14} className="animate-spin" /> Carregando...
                </p>
              )}

              <div className="space-y-2">
                {activeQuery.data?.map((contract) => (
                  <div
                    key={contract.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{contract.name}</p>
                      <p className="text-xs text-muted-foreground font-technical">
                        {contract.preposition} · {contract.slug}
                        {contract.alertEmail && <> · {contract.alertEmail}</>}
                        {contract.alertWhatsapp && <> · WhatsApp {contract.alertWhatsapp}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(contract)}
                        className="p-2 text-muted-foreground hover:text-orange transition-colors"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setPendingDelete({ contract, permanent: false })}
                        className="p-2 text-danger hover:opacity-70 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Formulário: novo ou edição */}
              {showForm ? (
                <form onSubmit={handleSubmit} className="mt-4 p-3 rounded-xl border border-border space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    {editingId ? 'Editar contrato' : 'Novo contrato'}
                  </p>
                  <div>
                    <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      Nome do contrato
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Integridade Estrutural"
                      autoFocus
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                    />
                  </div>
                  <div>
                    <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      Gênero (para o título "Gestão de Controle do Contrato ___")
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPreposition('do')}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                          preposition === 'do'
                            ? 'bg-navy text-white border-navy'
                            : 'bg-card text-muted-foreground border-border'
                        }`}
                      >
                        do (ex: do LOM)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreposition('da')}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
                          preposition === 'da'
                            ? 'bg-navy text-white border-navy'
                            : 'bg-card text-muted-foreground border-border'
                        }`}
                      >
                        da (ex: da Geomecânica)
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      E-mail de alerta (opcional)
                    </label>
                    <input
                      type="email"
                      value={alertEmail}
                      onChange={(e) => setAlertEmail(e.target.value)}
                      placeholder="Deixe em branco para usar o e-mail global"
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Quem recebe os alertas de treinamento vencendo/vencido deste contrato. Sem
                      preencher, usa o e-mail configurado globalmente no Railway.
                    </p>
                  </div>
                  <div>
                    <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      WhatsApp de alerta (opcional)
                    </label>
                    <input
                      type="tel"
                      value={alertWhatsapp}
                      onChange={(e) => setAlertWhatsapp(e.target.value)}
                      placeholder="Ex: 11999999999"
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Número com DDD (o DDI do Brasil é adicionado automaticamente). Deixe em
                      branco para não enviar alerta por WhatsApp deste contrato.
                    </p>
                  </div>

                  {editingId && editingSlug && (
                    <div className="border-t border-border pt-3">
                      <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                        Campos personalizados deste contrato
                      </p>

                      {fieldsQuery.data && fieldsQuery.data.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {fieldsQuery.data.map((f) => (
                            <div
                              key={f.id}
                              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border bg-muted/30"
                            >
                              <span className="text-sm text-foreground">
                                {f.label}{' '}
                                <span className="text-xs text-muted-foreground font-technical">
                                  ({f.fieldType === 'text' ? 'texto' : f.fieldType === 'number' ? 'número' : 'data'})
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteField(f.id)}
                                disabled={deleteFieldMutation.isPending}
                                className="text-danger hover:opacity-70 text-xs font-semibold disabled:opacity-40"
                              >
                                Excluir
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {(fieldsQuery.data?.length ?? 0) < 5 && (
                        <div className="flex gap-2">
                          <input
                            value={newFieldLabel}
                            onChange={(e) => setNewFieldLabel(e.target.value)}
                            placeholder="Ex: Matrícula do cliente"
                            disabled={createFieldMutation.isPending}
                            className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                          />
                          <select
                            value={newFieldType}
                            onChange={(e) => setNewFieldType(e.target.value as 'text' | 'number' | 'date')}
                            disabled={createFieldMutation.isPending}
                            className="px-2 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
                          >
                            <option value="text">Texto</option>
                            <option value="number">Número</option>
                            <option value="date">Data</option>
                          </select>
                          <button
                            type="button"
                            onClick={handleAddField}
                            disabled={createFieldMutation.isPending || !newFieldLabel.trim()}
                            className="shrink-0 px-3 py-2 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                          >
                            +
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Aparecem no cadastro de colaborador só deste contrato. Máximo de 5 campos.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || !name.trim()}
                      className="flex-1 bg-orange text-white rounded-lg py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar contrato'}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={isSubmitting}
                      className="px-4 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-orange hover:text-orange transition text-sm font-semibold"
                >
                  <Plus size={16} />
                  Novo contrato
                </button>
              )}
            </>
          ) : tab === 'trash' ? (
            <>
              {trashQuery.isLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
                  <Loader size={14} className="animate-spin" /> Carregando...
                </p>
              )}
              {trashed.length === 0 && !trashQuery.isLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  A lixeira está vazia.
                </p>
              )}
              <div className="space-y-2">
                {trashed.map((contract) => (
                  <div
                    key={contract.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{contract.name}</p>
                      <p className="text-xs text-muted-foreground font-technical">
                        excluído em{' '}
                        {contract.deletedAt
                          ? new Date(contract.deletedAt).toLocaleDateString('pt-BR')
                          : '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRestore(contract)}
                        disabled={restoreMutation.isPending}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <RotateCcw size={13} />
                        Restaurar
                      </button>
                      <button
                        onClick={() => setPendingDelete({ contract, permanent: true })}
                        className="p-2 text-danger hover:opacity-70 transition-colors"
                        title="Excluir definitivamente"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {overviewQuery.isLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
                  <Loader size={14} className="animate-spin" /> Carregando...
                </p>
              )}
              {overviewQuery.data?.length === 0 && !overviewQuery.isLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum contrato com colaboradores cadastrados ainda.
                </p>
              )}
              {overviewQuery.data && overviewQuery.data.length > 0 && (
                <div className="space-y-4">
                  <div className="w-full" style={{ height: Math.max(220, overviewQuery.data.length * 60) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={overviewQuery.data}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="expired" stackId="s" name="Vencidos" fill="#d64550" />
                        <Bar dataKey="expiring" stackId="s" name="Vencendo" fill="#d99a20" />
                        <Bar dataKey="valid" stackId="s" name="Válidos" fill="#2d9f7f" radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2">
                    {overviewQuery.data.map((c) => (
                      <div
                        key={c.slug}
                        className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30"
                      >
                        <p className="font-medium text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-technical shrink-0">
                          {c.employees} colaborador{c.employees !== 1 ? 'es' : ''}
                          {c.expired > 0 && <span className="text-danger"> · {c.expired} vencido{c.expired !== 1 ? 's' : ''}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmação — mover para a lixeira ou excluir definitivamente */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2.5 rounded-full ${pendingDelete.permanent ? 'bg-danger/15' : 'bg-warning/15'}`}>
                <AlertTriangle size={20} className={pendingDelete.permanent ? 'text-danger' : 'text-warning'} />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                {pendingDelete.permanent ? 'Excluir definitivamente?' : 'Excluir contrato?'}
              </h3>
            </div>

            {pendingDelete.permanent ? (
              <div className="text-sm text-muted-foreground mb-5 space-y-2">
                <p>
                  Isso remove <span className="font-semibold text-foreground">"{pendingDelete.contract.name}"</span>{' '}
                  para sempre. Não é possível desfazer.
                </p>
                {usageQuery.isLoading ? (
                  <p className="flex items-center gap-2">
                    <Loader size={13} className="animate-spin" /> Verificando uso...
                  </p>
                ) : usageQuery.data && usageQuery.data.total > 0 ? (
                  <p className="text-danger font-medium">
                    Ainda há {usageQuery.data.employees} colaborador(es), {usageQuery.data.admins} conta(s) e{' '}
                    {usageQuery.data.documents} documento(s) neste contrato — reatribua-os antes de excluir.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-5">
                <span className="font-semibold text-foreground">"{pendingDelete.contract.name}"</span> vai para a
                lixeira. Colaboradores, contas e documentos já cadastrados nele não são afetados, mas o contrato
                deixa de aparecer para escolha. Você pode restaurar depois, a qualquer momento.
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={confirmDelete}
                disabled={
                  deleteMutation.isPending ||
                  permanentDeleteMutation.isPending ||
                  (pendingDelete.permanent && (usageQuery.isLoading || (usageQuery.data?.total ?? 0) > 0))
                }
                className="flex-1 bg-danger text-white py-2.5 rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50 transition"
              >
                {deleteMutation.isPending || permanentDeleteMutation.isPending
                  ? 'Aguarde...'
                  : pendingDelete.permanent
                    ? 'Excluir para sempre'
                    : 'Sim, excluir'}
              </button>
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 bg-muted text-foreground py-2.5 rounded-xl font-bold text-sm hover:opacity-80 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
