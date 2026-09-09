import { daysUntilDate } from '@shared/calendar-date';
import type { Employee, FilterType, Statistics, TrainingStatus } from './types';

export function getTrainingStatus(expirationDate: string): TrainingStatus {
  if (!expirationDate) {
    return { status: 'unknown', label: 'Data não definida', diffDays: 0 };
  }

  const diffDays = daysUntilDate(expirationDate);
  if (diffDays === null) return { status: 'unknown', label: 'Data inválida', diffDays: 0 };

  if (diffDays < 0) {
    return {
      status: 'expired',
      label: `Vencido há ${Math.abs(diffDays)} dia${Math.abs(diffDays) !== 1 ? 's' : ''}`,
      diffDays,
    };
  } else if (diffDays <= 30) {
    return {
      status: 'expiring',
      label: `Vence em ${diffDays} dia${diffDays !== 1 ? 's' : ''}`,
      diffDays,
    };
  } else {
    return {
      status: 'valid',
      label: `Válido por ${diffDays} dias`,
      diffDays,
    };
  }
}

export function getFilteredEmployees(employees: Employee[], filter: FilterType, searchQuery: string = ''): Employee[] {
  let filtered = employees;

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((emp) =>
      emp.name.toLowerCase().includes(query)
    );
  }

  // Apply status filter
  let result: Employee[];
  if (filter === 'all') {
    result = filtered;
  } else {
    result = filtered.filter((emp) => {
      if (!emp.trainings || emp.trainings.length === 0) return false;
      return emp.trainings.some((training) => {
        const status = getTrainingStatus(training.expirationDate).status;
        return status === filter;
      });
    });
  }

  // Sort employees alphabetically by first name, then by full name
  result.sort((a, b) => {
    const nameA = (a.name || '').trim().toLowerCase();
    const nameB = (b.name || '').trim().toLowerCase();
    const firstNameA = nameA.split(' ')[0];
    const firstNameB = nameB.split(' ')[0];
    const firstNameCompare = firstNameA.localeCompare(firstNameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    if (firstNameCompare === 0) {
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    }
    return firstNameCompare;
  });

  return result;
}

export function getStatistics(employees: Employee[]): Statistics {
  let total = 0;
  let expired = 0;
  let expiring = 0;
  let valid = 0;

  employees.forEach((emp) => {
    if (emp.trainings) {
      emp.trainings.forEach((training) => {
        total++;
        const status = getTrainingStatus(training.expirationDate).status;
        if (status === 'expired') expired++;
        else if (status === 'expiring') expiring++;
        else if (status === 'valid') valid++;
      });
    }
  });

  return { total, expired, expiring, valid };
}

export function getWorstStatus(employee: Employee): 'expired' | 'expiring' | 'valid' | 'none' | 'unknown' {
  if (!employee.trainings || employee.trainings.length === 0) return 'none';

  let hasExpired = false;
  let hasExpiring = false;
  let hasUnknown = false;

  for (const training of employee.trainings) {
    const status = getTrainingStatus(training.expirationDate).status;
    if (status === 'expired') hasExpired = true;
    else if (status === 'expiring') hasExpiring = true;
    else if (status === 'unknown') hasUnknown = true;
  }

  if (hasExpired) return 'expired';
  if (hasExpiring) return 'expiring';
  if (hasUnknown) return 'unknown';
  return 'valid';
}

