import { useMemo } from 'react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus } from '@/lib/training-utils';

export interface TrainingAlertItem {
  employeeId: string;
  employeeName: string;
  trainingName: string;
  daysUntil: number;
  status: 'expired' | 'expiring';
}

/**
 * Alertas de treinamento a partir da lista já carregada — usado tanto no
 * resumo de boas-vindas quanto no sininho de notificações do cabeçalho, para
 * os dois sempre baterem o mesmo número.
 */
export function useTrainingAlerts(employees: Employee[]) {
  return useMemo(() => {
    const items: TrainingAlertItem[] = [];

    for (const emp of employees) {
      for (const training of emp.trainings ?? []) {
        const status = getTrainingStatus(training.expirationDate);
        if (status.status === 'expired') {
          items.push({
            employeeId: emp.id,
            employeeName: emp.name,
            trainingName: training.name,
            daysUntil: status.diffDays,
            status: 'expired',
          });
        } else if (status.status === 'expiring') {
          items.push({
            employeeId: emp.id,
            employeeName: emp.name,
            trainingName: training.name,
            daysUntil: status.diffDays,
            status: 'expiring',
          });
        }
      }
    }

    // Mais urgente primeiro.
    items.sort((a, b) => a.daysUntil - b.daysUntil);

    const expiredCount = items.filter((i) => i.status === 'expired').length;
    const expiringThisWeek = items.filter((i) => i.status === 'expiring' && i.daysUntil <= 7).length;
    const expiringTotal = items.filter((i) => i.status === 'expiring').length;

    return { items, expiredCount, expiringThisWeek, expiringTotal };
  }, [employees]);
}
