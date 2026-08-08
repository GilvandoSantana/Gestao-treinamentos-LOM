/*
 * Design: Industrial Blueprint — Neo-Industrial
 * RenewTrainingModal: renova o mesmo treinamento para vários colaboradores de
 * uma vez, para quando uma turma inteira faz a reciclagem no mesmo dia.
 */

import { useMemo, useState } from 'react';
import { RefreshCw, Search, Loader, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import type { Employee } from '@/lib/types';

interface RenewTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
}

export default function RenewTrainingModal({ isOpen, onClose, employees }: RenewTrainingModalProps) {
  const [trainingName, setTrainingName] = useState('');
  const [completionDate, setCompletionDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const utils = trpc.useUtils();
  const trainingNamesQuery = trpc.employees.trainingNames.useQuery(undefined, { enabled: isOpen });
  const renewMutation = trpc.employees.renewTrainingBulk.useMutation();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? employees.filter(
          (e) => e.name.toLowerCase().includes(query) || e.role?.toLowerCase().includes(query)
        )
      : employees;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((e) => next.delete(e.id));
      else filtered.forEach((e) => next.add(e.id));
      return next;
    });
  };

  // Quantos dos selecionados já têm esse treinamento (serão atualizados) vs.
  // vão ganhar um treinamento novo — mostrado antes de confirmar.
  const preview = useMemo(() => {
    if (!trainingName.trim()) return null;
    const normalized = trainingName.trim().toLowerCase();
    let willUpdate = 0;
    let willCreate = 0;
    for (const id of Array.from(selectedIds)) {
      const emp = employees.find((e) => e.id === id);
      const has = emp?.trainings?.some((t) => t.name.trim().toLowerCase() === normalized);
      if (has) willUpdate++;
      else willCreate++;
    }
    return { willUpdate, willCreate };
  }, [selectedIds, trainingName, employees]);

  const reset = () => {
    setTrainingName('');
    setCompletionDate('');
    setExpirationDate('');
    setSelectedIds(new Set());
    setSearch('');
  };

  const handleSubmit = async () => {
    if (!trainingName.trim()) {
      toast.error('Informe o nome do treinamento.');
      return;
    }
    if (!completionDate || !expirationDate) {
      toast.error('Informe as duas datas.');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Selecione ao menos um colaborador.');
      return;
    }

    try {
      const result = await renewMutation.mutateAsync({
        employeeIds: Array.from(selectedIds),
        trainingName: trainingName.trim(),
        completionDate,
        expirationDate,
      });
      toast.success(
        `${result.updated} renovado(s) e ${result.created} novo(s) cadastrado(s), de ${result.total} colaborador(es).`
      );
      await utils.employees.list.invalidate();
      await utils.employees.trainingNames.invalidate();
      reset();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao renovar em lote.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <RefreshCw className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">
                Renovar treinamento em lote
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size === 0
                  ? 'Escolha o treinamento, as datas e os colaboradores'
                  : `${selectedIds.size} colaborador(es) selecionado(s)`}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pt-3 space-y-3">
          <div>
            <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Nome do treinamento
            </label>
            <input
              list="renew-training-suggestions"
              value={trainingName}
              onChange={(e) => setTrainingName(e.target.value)}
              placeholder="Ex: NR-35 Trabalho em Altura"
              disabled={renewMutation.isPending}
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            />
            <datalist id="renew-training-suggestions">
              {trainingNamesQuery.data?.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                <Calendar size={11} className="inline mr-1" />
                Realização
              </label>
              <input
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                disabled={renewMutation.isPending}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
              />
            </div>
            <div>
              <label className="block font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                <Calendar size={11} className="inline mr-1" />
                Vencimento
              </label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                disabled={renewMutation.isPending}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
              />
            </div>
          </div>

          {preview && selectedIds.size > 0 && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              {preview.willUpdate > 0 && <>Renova {preview.willUpdate} que já tinham esse treinamento. </>}
              {preview.willCreate > 0 && <>Cadastra {preview.willCreate} de novo.</>}
            </p>
          )}
        </div>

        <div className="px-4 pt-3 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou função"
              disabled={renewMutation.isPending}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-orange"
            />
          </div>
          <button
            onClick={toggleAllFiltered}
            disabled={renewMutation.isPending || filtered.length === 0}
            className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/70 disabled:opacity-50 transition"
          >
            {allFilteredSelected ? 'Limpar' : 'Todos'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum colaborador encontrado.</p>
          ) : (
            filtered.map((employee) => (
              <label
                key={employee.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(employee.id)}
                  onChange={() => toggle(employee.id)}
                  disabled={renewMutation.isPending}
                  className="w-4 h-4 accent-orange shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground truncate">{employee.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{employee.role}</span>
                </span>
              </label>
            ))
          )}
        </div>

        <div className="p-4 border-t border-border">
          <button
            onClick={handleSubmit}
            disabled={renewMutation.isPending || selectedIds.size === 0}
            className="w-full flex items-center justify-center gap-2 bg-orange text-white rounded-xl py-3 font-bold hover:opacity-90 disabled:opacity-50 transition"
          >
            {renewMutation.isPending ? (
              <>
                <Loader size={17} className="animate-spin" />
                Renovando...
              </>
            ) : (
              <>
                <RefreshCw size={17} />
                Renovar para {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}colaborador
                {selectedIds.size !== 1 ? 'es' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
