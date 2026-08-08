/**
 * EmployeeCardWithCertificates Component
 * Extended EmployeeCard with certificate listing and badge generation functionality
 */

import { Edit2, Trash2, Calendar, Shield, User, ChevronDown, FileText, UserRoundX, MoreVertical, Copy, History, FileDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus, getWorstStatus } from '@/lib/training-utils';
import CertificatesList from './CertificatesList';

interface EmployeeCardWithCertificatesProps {
  employee: Employee;
  index: number;
  onEdit: (employee: Employee) => void;
  onDuplicate?: (employee: Employee) => void;
  onExportData?: (employee: Employee) => void;
  onDelete: (id: string) => void;
  onDismiss?: (employee: Employee) => void;
  onViewAudit?: (employee: Employee) => void;
  isAdmin?: boolean;
}

// Anel da foto na cor da situação — o mesmo código de cor da borda esquerda,
// reforçado onde o olho bate primeiro.
const statusRingMap = {
  expired: 'bg-danger',
  expiring: 'bg-warning',
  valid: 'bg-teal',
  none: 'bg-white/20',
};

const statusBorderMap = {
  expired: 'border-l-danger',
  expiring: 'border-l-warning',
  valid: 'border-l-teal',
  none: 'border-l-muted-foreground',
};

const statusBgMap = {
  expired: 'bg-danger/10 text-danger border-danger/20',
  expiring: 'bg-warning/10 text-warning border-warning/20',
  valid: 'bg-success-light text-teal border-teal/20',
  unknown: 'bg-muted text-muted-foreground border-border',
};

const statusDotMap = {
  expired: 'bg-danger',
  expiring: 'bg-warning animate-pulse-soft',
  valid: 'bg-teal',
  unknown: 'bg-muted-foreground',
};

export default function EmployeeCardWithCertificates({
  employee,
  index,
  onEdit,
  onDuplicate,
  onExportData,
  onDelete,
  onDismiss,
  onViewAudit,
  isAdmin = false,
}: EmployeeCardWithCertificatesProps) {
  const [isTrainingsExpanded, setIsTrainingsExpanded] = useState(false);
  const [expandedTrainingId, setExpandedTrainingId] = useState<string | null>(null);
  const [certificatesRefresh, setCertificatesRefresh] = useState(0);

  const worstStatus = getWorstStatus(employee);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Fecha o menu de ações ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!actionsOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [actionsOpen]);

  // Resumo por situação, exibido como etiquetas no cabeçalho.
  const trainingSummary = useMemo(() => {
    const summary = { total: 0, expired: 0, expiring: 0, valid: 0 };
    (employee.trainings ?? []).forEach((t) => {
      summary.total++;
      const status = getTrainingStatus(t.expirationDate).status;
      if (status === 'expired') summary.expired++;
      else if (status === 'expiring') summary.expiring++;
      else if (status === 'valid') summary.valid++;
    });
    return summary;
  }, [employee.trainings]);

  const handleCertificatesChange = () => {
    setCertificatesRefresh(prev => prev + 1);
  };

  return (
    <>
      <div
        className={`bg-card rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border-l-4 ${statusBorderMap[worstStatus]} animate-fade-in-up group`}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-navy via-navy to-navy-light p-5">
          {/* Marcas de canto (desenho técnico) — mesma linguagem do cabeçalho */}
          <div className="absolute top-2.5 left-2.5 w-2.5 h-2.5 border-t border-l border-white/20 pointer-events-none" />
          <div className="absolute bottom-2.5 right-2.5 w-2.5 h-2.5 border-b border-r border-white/20 pointer-events-none" />

          <div className="flex items-start gap-4">
            {/* Foto maior, com anel na cor da situação */}
            <div
              className={`shrink-0 rounded-xl p-[2.5px] ${statusRingMap[worstStatus]}`}
            >
              <div className="bg-white/10 w-[68px] h-[68px] rounded-[10px] overflow-hidden flex items-center justify-center">
                {employee.photoUrl ? (
                  <img
                    src={employee.photoUrl}
                    alt={employee.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={32} className="text-white/70" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[19px] leading-tight font-bold text-white truncate tracking-tight">
                {employee.name}
              </h3>

              <p className="text-white/75 text-[15px] truncate mt-1">{employee.role}</p>

              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {employee.registration && (
                  <span className="bg-white/10 border border-white/20 px-2 py-0.5 rounded text-[11px] font-technical text-white/80">
                    Mat. {employee.registration}
                  </span>
                )}
                {employee.educationLevel && (
                  <span className="bg-white/[0.07] px-2 py-0.5 rounded text-[11px] text-white/60">
                    {employee.educationLevel}
                  </span>
                )}
                {(() => {
                  const bd = employee.birthDate;
                  let age: number | undefined = employee.age ?? undefined;
                  if (bd) {
                    const birth = new Date(bd);
                    const today = new Date();
                    let a = today.getFullYear() - birth.getFullYear();
                    const m = today.getMonth() - birth.getMonth();
                    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
                    age = a;
                  }
                  return age !== undefined ? (
                    <span className="bg-white/[0.07] px-2 py-0.5 rounded text-[11px] text-white/60">
                      {age} anos
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Ações reunidas num menu, para o cabeçalho não virar uma fileira
                de botões coloridos */}
            {isAdmin && (
              <div className="relative shrink-0" ref={actionsRef}>
                <button
                  onClick={() => setActionsOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={actionsOpen}
                  aria-label="Ações do colaborador"
                  className={`p-2 rounded-lg border transition-all ${
                    actionsOpen
                      ? 'bg-white text-navy border-white'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                  }`}
                >
                  <MoreVertical size={17} />
                </button>

                {actionsOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 w-48 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-30"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setActionsOpen(false);
                        onEdit(employee);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors text-left"
                    >
                      <Edit2 size={15} className="text-muted-foreground" />
                      Editar
                    </button>

                    {onDuplicate && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setActionsOpen(false);
                          onDuplicate(employee);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors text-left"
                      >
                        <Copy size={15} className="text-muted-foreground" />
                        Duplicar
                      </button>
                    )}

                    {onExportData && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setActionsOpen(false);
                          onExportData(employee);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors text-left"
                      >
                        <FileDown size={15} className="text-muted-foreground" />
                        Exportar dados (LGPD)
                      </button>
                    )}

                    {onDismiss && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setActionsOpen(false);
                          onDismiss(employee);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors text-left"
                      >
                        <UserRoundX size={15} className="text-muted-foreground" />
                        Demitido
                      </button>
                    )}

                    <button
                      role="menuitem"
                      onClick={() => {
                        setActionsOpen(false);
                        onDelete(employee.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-danger hover:bg-danger/10 transition-colors text-left border-t border-border"
                    >
                      <Trash2 size={15} />
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Resumo da situação dos treinamentos */}
          {trainingSummary.total > 0 && (
            <div className="flex items-center gap-1.5 mt-3.5 flex-wrap">
              {trainingSummary.expired > 0 && (
                <span className="flex items-center gap-1 bg-danger/20 text-danger-light px-2 py-1 rounded-md text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                  {trainingSummary.expired} vencido{trainingSummary.expired !== 1 ? 's' : ''}
                </span>
              )}
              {trainingSummary.expiring > 0 && (
                <span className="flex items-center gap-1 bg-warning/20 text-warning px-2 py-1 rounded-md text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  {trainingSummary.expiring} vencendo
                </span>
              )}
              {trainingSummary.valid > 0 && (
                <span className="flex items-center gap-1 bg-teal/20 text-teal-light px-2 py-1 rounded-md text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                  {trainingSummary.valid} em dia
                </span>
              )}
            </div>
          )}
        </div>

        {/* Trainings */}
        <div className="p-4">
          {/* Última atualização — discreto, no topo do bloco de treinamentos */}
          {employee.updatedAt && (
            <p className="text-[11px] text-muted-foreground font-technical mb-2 flex items-center gap-1">
              <History size={11} className="opacity-60" />
              Atualizado em {new Date(employee.updatedAt).toLocaleDateString('pt-BR')}
            </p>
          )}
          {employee.trainings && employee.trainings.length > 0 ? (
            <div>
              <button
                onClick={() => setIsTrainingsExpanded(!isTrainingsExpanded)}
                className="w-full flex items-center justify-between gap-2 mb-3 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-orange" />
                  <span className="font-semibold text-foreground text-sm">
                    Treinamentos ({employee.trainings.length})
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-muted-foreground transition-transform duration-300 ${
                    isTrainingsExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isTrainingsExpanded && (
                <div className="space-y-2.5">
                  {employee.trainings.map((training) => {
                    const statusInfo = getTrainingStatus(training.expirationDate);
                    const isExpanded = expandedTrainingId === training.id;

                    return (
                      <div key={training.id}>
                        <div
                          className={`rounded-lg p-3 border ${statusBgMap[statusInfo.status]} transition-all duration-200`}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDotMap[statusInfo.status]}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Shield size={13} className="shrink-0 opacity-60" />
                                <h4 className="font-semibold text-sm truncate">{training.name}</h4>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5 text-xs opacity-80">
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} />
                                  Realizado:{' '}
                                  {new Date(training.completionDate + 'T00:00:00').toLocaleDateString(
                                    'pt-BR'
                                  )}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} />
                                  Vencimento:{' '}
                                  {new Date(training.expirationDate + 'T00:00:00').toLocaleDateString(
                                    'pt-BR'
                                  )}
                                </span>
                              </div>
                              <p className="text-xs font-bold mt-1.5">{statusInfo.label}</p>

                              {/* Certificate Actions */}
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() =>
                                    setExpandedTrainingId(
                                      isExpanded ? null : training.id
                                    )
                                  }
                                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                >
                                  <FileText size={12} />
                                  {isExpanded ? 'Ocultar Certificados' : 'Ver Certificados'}
                                </button>
                              </div>

                              {/* Certificates List */}
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-current/10">
                                  <CertificatesList
                                    trainingId={training.id}
                                    employeeId={employee.id}
                                    onCertificatesChange={handleCertificatesChange}
                                    isAdmin={isAdmin}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-6">
              Nenhum treinamento cadastrado
            </p>
          )}
        </div>
      </div>
    </>
  );
}
