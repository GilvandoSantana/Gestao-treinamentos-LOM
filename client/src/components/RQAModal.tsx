/*
 * Design: Industrial Blueprint — Neo-Industrial
 * RQAModal: Lançamentos RQA's (Registro de Quase Acidente) — substitui a
 * planilha de Excel mensal que o Gilvando usava (ideia dele, 16/09).
 * Um mês por vez: resumo geral, por líder, por área, e a lista de
 * colaboradores com quantidade lançada, % alcançada, status e ranking.
 */

import { useState, useMemo, useEffect } from 'react';
import { ShieldAlert, X, ChevronLeft, ChevronRight, Save, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface RQAModalProps {
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

const SITUACAO_OPTIONS = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'FERIAS', label: 'Férias' },
  { value: 'AFASTADO', label: 'Afastado' },
  { value: 'INATIVO', label: 'Inativo' },
] as const;

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function statusClasses(status: string): string {
  if (status === 'OK') return 'bg-teal/10 text-teal';
  if (status === 'ATENÇÃO') return 'bg-orange/10 text-orange';
  if (status === 'ABAIXO') return 'bg-danger/10 text-danger';
  return 'bg-muted text-muted-foreground';
}

interface EditableEntry {
  quantidade: number;
  situacao: 'ATIVO' | 'FERIAS' | 'AFASTADO' | 'INATIVO';
}

export default function RQAModal({ isOpen, onClose, canManage }: RQAModalProps) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [edited, setEdited] = useState<Record<string, EditableEntry>>({});

  const reportQuery = trpc.rqa.getReport.useQuery({ yearMonth }, { enabled: isOpen });
  const saveMutation = trpc.rqa.saveEntries.useMutation();
  const utils = trpc.useUtils();

  // Reseta as edições locais sempre que troca de mês ou os dados do
  // servidor chegam de novo — evita misturar edição de um mês com dado
  // de outro.
  useEffect(() => {
    setEdited({});
  }, [yearMonth]);

  const report = reportQuery.data;

  const rows = useMemo(() => {
    if (!report) return [];
    return report.porColaborador.map((row) => {
      const override = edited[row.employeeId];
      return override ? { ...row, quantidade: override.quantidade, situacao: override.situacao } : row;
    });
  }, [report, edited]);

  const hasChanges = Object.keys(edited).length > 0;

  const handleQuantidadeChange = (employeeId: string, value: number, currentSituacao: string) => {
    setEdited((prev) => ({
      ...prev,
      [employeeId]: {
        quantidade: Math.max(0, value),
        situacao: (prev[employeeId]?.situacao ?? currentSituacao) as EditableEntry['situacao'],
      },
    }));
  };

  const handleSituacaoChange = (employeeId: string, value: EditableEntry['situacao'], currentQuantidade: number) => {
    setEdited((prev) => ({
      ...prev,
      [employeeId]: {
        quantidade: prev[employeeId]?.quantidade ?? currentQuantidade,
        situacao: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!report) return;
    const entries = rows.map((row) => ({
      employeeId: row.employeeId,
      quantidade: row.quantidade,
      situacao: row.situacao as EditableEntry['situacao'],
    }));
    try {
      await saveMutation.mutateAsync({ yearMonth, entries });
      toast.success('Lançamentos salvos.');
      setEdited({});
      await utils.rqa.getReport.invalidate({ yearMonth });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar os lançamentos.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-1.5 sm:p-3">
      <div className="bg-card rounded-2xl shadow-2xl w-full h-full sm:h-[97vh] sm:w-[97vw] max-w-none flex flex-col">
        <div className="relative bg-gradient-to-r from-navy to-navy-light p-5 pt-6">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-3.5 h-3.5 rounded-full bg-background border border-black/10" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldAlert className="text-orange-light shrink-0" size={21} />
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold text-white truncate">Lançamentos RQA&apos;s</h2>
                <p className="text-xs text-white/60 truncate">Registro de Quase Acidente — por mês</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white shrink-0">
              <X size={23} />
            </button>
          </div>
        </div>
        <div className="h-0 border-t border-dashed border-border/70" aria-hidden="true" />

        <div className="flex items-center justify-center gap-3 px-4 py-3 border-b border-border">
          <button
            onClick={() => setYearMonth((m) => shiftYearMonth(m, -1))}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="font-display font-bold text-sm text-foreground capitalize w-40 text-center">
            {formatYearMonthLabel(yearMonth)}
          </p>
          <button
            onClick={() => setYearMonth((m) => shiftYearMonth(m, 1))}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {reportQuery.isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader size={18} className="animate-spin" /> Carregando...
            </div>
          )}

          {report && (
            <>
              {/* Resumo geral */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 mb-4">
                <SummaryCard label="Colaboradores" value={String(report.totalColaboradores)} />
                <SummaryCard label="Ativos" value={String(report.ativos)} />
                <SummaryCard label="Meta da unidade" value={String(report.metaUnidade)} />
                <SummaryCard label="RQA entregue" value={String(report.totalEntregue)} />
                <SummaryCard label="% Alcançada" value={formatPercent(report.percentGeral)} highlight />
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <SummaryCard label="Abaixo da meta" value={String(report.colaboradoresAbaixoMeta)} tone="danger" />
                <SummaryCard label="Atingiram a meta" value={String(report.colaboradoresAtingiramMeta)} tone="teal" />
              </div>

              {/* Por líder / por área */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <GroupTable title="Resultado por líder" groups={report.porLider} />
                <GroupTable title="Resultado por área" groups={report.porArea} />
              </div>

              {/* Tabela de colaboradores */}
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2.5">Nome</th>
                      <th className="text-left p-2.5">Função</th>
                      <th className="text-left p-2.5">Líder</th>
                      <th className="text-left p-2.5">Área</th>
                      <th className="text-left p-2.5">Situação</th>
                      <th className="text-center p-2.5">Qtd. RQA</th>
                      <th className="text-center p-2.5">Meta</th>
                      <th className="text-center p-2.5">% Alcançada</th>
                      <th className="text-center p-2.5">Status</th>
                      <th className="text-center p-2.5">Ranking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.employeeId} className="border-t border-border">
                        <td className="p-2.5 font-medium text-foreground whitespace-nowrap">{row.name}</td>
                        <td className="p-2.5 text-muted-foreground whitespace-nowrap">{row.role}</td>
                        <td className="p-2.5 text-muted-foreground whitespace-nowrap">{row.leader || '—'}</td>
                        <td className="p-2.5 text-muted-foreground whitespace-nowrap">{row.area || '—'}</td>
                        <td className="p-2.5">
                          {canManage ? (
                            <select
                              value={row.situacao}
                              onChange={(e) =>
                                handleSituacaoChange(
                                  row.employeeId,
                                  e.target.value as EditableEntry['situacao'],
                                  row.quantidade
                                )
                              }
                              className="border border-input rounded-lg px-2 py-1 bg-background text-foreground text-xs"
                            >
                              {SITUACAO_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {SITUACAO_OPTIONS.find((o) => o.value === row.situacao)?.label ?? row.situacao}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center">
                          {canManage ? (
                            <input
                              type="number"
                              min={0}
                              value={row.quantidade}
                              onChange={(e) =>
                                handleQuantidadeChange(row.employeeId, Number(e.target.value) || 0, row.situacao)
                              }
                              className="w-16 border border-input rounded-lg px-2 py-1 text-center bg-background text-foreground"
                            />
                          ) : (
                            row.quantidade
                          )}
                        </td>
                        <td className="p-2.5 text-center text-muted-foreground">{row.metaIndividual}</td>
                        <td className="p-2.5 text-center text-foreground">
                          {row.percentAlcancada === null ? '—' : formatPercent(row.percentAlcancada)}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusClasses(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-center text-muted-foreground">{row.ranking ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {canManage && (
          <div className="p-3 border-t border-border">
            <button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-orange text-white font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader size={16} className="animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Save size={16} /> Salvar lançamentos {hasChanges ? `(${Object.keys(edited).length} alterado(s))` : ''}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'danger' | 'teal';
}) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'teal' ? 'text-teal' : 'text-foreground';
  return (
    <div className={`p-3 rounded-xl border border-border bg-muted/30 ${highlight ? 'border-orange/40' : ''}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className={`font-display font-bold text-xl ${toneClass}`}>{value}</p>
    </div>
  );
}

function GroupTable({ title, groups }: { title: string; groups: { nome: string; ativos: number; meta: number; totalRqa: number; percentAtingimento: number }[] }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50 px-3 py-2">
        {title}
      </p>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground p-3">Nenhum registro ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-2">Nome</th>
                <th className="text-center p-2">Ativos</th>
                <th className="text-center p-2">Meta</th>
                <th className="text-center p-2">Total</th>
                <th className="text-center p-2">%</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.nome} className="border-t border-border">
                  <td className="p-2 font-medium text-foreground whitespace-nowrap">{g.nome}</td>
                  <td className="p-2 text-center text-muted-foreground">{g.ativos}</td>
                  <td className="p-2 text-center text-muted-foreground">{g.meta}</td>
                  <td className="p-2 text-center text-foreground">{g.totalRqa}</td>
                  <td className="p-2 text-center font-semibold text-foreground">{formatPercent(g.percentAtingimento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
