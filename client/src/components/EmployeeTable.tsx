/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EmployeeTable: Compact table view for employees and their training status.
 */

import { Edit2, Trash2, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus, getWorstStatus } from '@/lib/training-utils';

interface EmployeeTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
  onViewAudit?: (employee: Employee) => void;
  isAdmin?: boolean;
}

const statusBadgeMap: Record<string, string> = {
  expired: 'bg-danger/10 text-danger border-danger/20',
  expiring: 'bg-warning/10 text-warning border-warning/20',
  valid: 'bg-success-light text-teal border-teal/20',
  unknown: 'bg-muted text-muted-foreground border-border',
  none: 'bg-muted text-muted-foreground border-border',
};

const statusDotMap: Record<string, string> = {
  expired: 'bg-danger',
  expiring: 'bg-warning animate-pulse-soft',
  valid: 'bg-teal',
  unknown: 'bg-muted-foreground',
  none: 'bg-muted-foreground',
};

export default function EmployeeTable({ employees, onEdit, onDelete, onViewAudit, isAdmin = false }: EmployeeTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="bg-card rounded-xl shadow-sm overflow-hidden border border-border animate-fade-in-up">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-navy text-white">
              <th className="p-4 font-bold text-sm uppercase tracking-wider w-10"></th>
              <th className="p-4 font-bold text-sm uppercase tracking-wider">Colaborador</th>
              <th className="p-4 font-bold text-sm uppercase tracking-wider hidden md:table-cell">Função</th>
              <th className="p-4 font-bold text-sm uppercase tracking-wider hidden sm:table-cell">Matrícula</th>
              <th className="p-4 font-bold text-sm uppercase tracking-wider">Status Geral</th>
              <th className="p-4 font-bold text-sm uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.map((employee) => {
              const worstStatus = getWorstStatus(employee);
              const isExpanded = expandedId === employee.id;
              
              return (
                <React.Fragment key={employee.id}>
                  <tr 
                    className={`hover:bg-muted/50 transition-colors cursor-pointer ${isExpanded ? 'bg-muted/30' : ''}`}
                    onClick={() => toggleExpand(employee.id)}
                  >
                    <td className="p-4 text-center">
                      {isExpanded ? <ChevronUp size={18} className="text-navy" /> : <ChevronDown size={18} className="text-muted-foreground" />}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-foreground">{employee.name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">{employee.role}</div>
                    </td>
                    <td className="p-4 hidden md:table-cell text-sm text-foreground">
                      {employee.role}
                    </td>
                    <td className="p-4 hidden sm:table-cell text-sm font-mono text-muted-foreground">
                      {employee.registration ? `#${employee.registration}` : '-'}
                    </td>
                    <td className="p-4">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-bold ${statusBadgeMap[worstStatus]}`}>
                        <span className={`w-2 h-2 rounded-full ${statusDotMap[worstStatus]}`} />
                        {worstStatus === 'expired' ? 'Vencido' : worstStatus === 'expiring' ? 'A Vencer' : worstStatus === 'valid' ? 'Em Dia' : 'Sem Treinos'}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {isAdmin && (
                          <button
                            onClick={() => onEdit(employee)}
                            className="p-2 text-navy hover:bg-navy/10 rounded-lg transition-all animate-in fade-in zoom-in duration-300"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            onClick={() => onDelete(employee.id)}
                            className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-all animate-in fade-in zoom-in duration-300"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded Row with Trainings */}
                  {isExpanded && (
                    <tr className="bg-muted/10">
                      <td colSpan={6} className="p-0">
                        <div className="p-4 border-t border-border/50 animate-fade-in">
                          <h4 className="text-sm font-bold text-navy mb-3 flex items-center gap-2">
                            <Shield size={16} className="text-orange" />
                            Treinamentos de {employee.name}
                          </h4>
                          
                          {employee.trainings && employee.trainings.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {employee.trainings.map((training) => {
                                const statusInfo = getTrainingStatus(training.expirationDate);
                                return (
                                  <div 
                                    key={training.id}
                                    className={`p-3 rounded-lg border bg-card flex flex-col gap-1 ${statusBadgeMap[statusInfo.status]}`}
                                  >
                                    <div className="font-bold text-sm truncate">{training.name}</div>
                                    <div className="text-[10px] opacity-80">
                                      Realizado: {new Date(training.completionDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </div>
                                    <div className="text-[10px] font-bold">
                                      Vencimento: {new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                    </div>
                                    <div className="text-[10px] mt-1 uppercase tracking-wider">{statusInfo.label}</div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Nenhum treinamento cadastrado.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React from 'react';
