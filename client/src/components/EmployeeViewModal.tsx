/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EmployeeViewModal: visualização somente leitura dos dados do colaborador
 * — sem nenhum campo editável, sem botão de salvar. Só consulta.
 */

import { X, User, Calendar, Phone, GraduationCap, IdCard, FileText, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getTrainingStatus } from '@/lib/training-utils';
import type { Employee } from '@/lib/types';

interface EmployeeViewModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, { Icon: typeof CheckCircle2; color: string; label: string }> = {
  valid: { Icon: CheckCircle2, color: 'text-teal', label: 'Em dia' },
  expiring: { Icon: AlertTriangle, color: 'text-warning', label: 'A vencer' },
  expired: { Icon: XCircle, color: 'text-danger', label: 'Vencido' },
  unknown: { Icon: HelpCircle, color: 'text-muted-foreground', label: 'Sem data' },
};

function formatDate(value?: string): string {
  if (!value) return '—';
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return value;
  }
}

export default function EmployeeViewModal({ isOpen, employee, onClose }: EmployeeViewModalProps) {
  const customFieldsQuery = trpc.contracts.fields.list.useQuery(undefined, { enabled: isOpen });

  if (!isOpen || !employee) return null;

  const filledCustomFields = (customFieldsQuery.data ?? []).filter(
    (field) => employee.customFields?.[field.fieldKey]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {employee.photoUrl ? (
              <img
                src={employee.photoUrl}
                alt={employee.name}
                className="w-12 h-12 rounded-full object-cover border border-border shrink-0"
              />
            ) : (
              <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User size={22} className="text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">{employee.name}</h2>
              <p className="text-sm text-muted-foreground truncate">{employee.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={23} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Dados pessoais — só consulta */}
          <div>
            <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Dados pessoais
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <IdCard size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Matrícula</p>
                  <p className="text-sm text-foreground">{employee.registration || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <GraduationCap size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Escolaridade</p>
                  <p className="text-sm text-foreground">{employee.educationLevel || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Data de nascimento</p>
                  <p className="text-sm text-foreground">{formatDate(employee.birthDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] text-muted-foreground">Telefone</p>
                  <p className="text-sm text-foreground">{employee.phone || '—'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Campos personalizados do contrato */}
          {filledCustomFields.length > 0 && (
            <div>
              <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <FileText size={12} />
                Campos deste contrato
              </p>
              <div className="grid grid-cols-2 gap-3">
                {filledCustomFields.map((field) => (
                  <div key={field.id}>
                    <p className="text-[11px] text-muted-foreground">{field.label}</p>
                    <p className="text-sm text-foreground">{employee.customFields?.[field.fieldKey] || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Treinamentos */}
          <div>
            <p className="font-technical text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Treinamentos ({employee.trainings.length})
            </p>
            {employee.trainings.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum treinamento cadastrado.</p>
            )}
            <div className="space-y-1.5">
              {employee.trainings.map((training) => {
                const status = getTrainingStatus(training.expirationDate);
                const style = STATUS_STYLES[status.status];
                return (
                  <div
                    key={training.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{training.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Realizado: {formatDate(training.completionDate)} · Vence: {formatDate(training.expirationDate)}
                      </p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs font-semibold shrink-0 ml-2 ${style.color}`}>
                      <style.Icon size={13} />
                      {style.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
