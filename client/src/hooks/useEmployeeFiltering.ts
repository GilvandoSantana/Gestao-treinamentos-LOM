import { useState, useEffect, useMemo } from 'react';
import type { Employee, FilterType } from '@/lib/types';
import { getFilteredEmployees, getStatistics, getWorstStatus } from '@/lib/training-utils';
import { useTrainingAlerts } from '@/hooks/useTrainingAlerts';

const PAGE_SIZE = 24;

/**
 * Toda a lógica de "quais colaboradores mostrar, na aba certa, na página
 * certa" — extraído do Home.tsx (que estava passando de 1000 linhas) sem
 * mudar nenhum comportamento, só organizando. Os nomes de saída são os
 * mesmos que já existiam no componente, então o JSX que os usa não
 * precisou mudar nada.
 */
export function useEmployeeFiltering(
  employees: Employee[],
  filter: FilterType,
  searchQuery: string,
  selectedRole: string,
  viewMode: 'grid' | 'table'
) {
  const activeEmployees = useMemo(() => employees.filter((e) => !e.dismissed), [employees]);
  const trainingAlerts = useTrainingAlerts(activeEmployees);
  const dismissedEmployees = useMemo(() => employees.filter((e) => e.dismissed), [employees]);

  const stats = useMemo(() => getStatistics(activeEmployees), [activeEmployees]);

  // Contagem por COLABORADOR (pela pior situação dele), para os selos da barra
  // inferior baterem com o tamanho da lista que cada aba mostra. O `stats`
  // acima conta treinamentos, que é outro número.
  const statusCounts = useMemo(() => {
    const counts = { expired: 0, expiring: 0, valid: 0 };
    for (const emp of activeEmployees) {
      const worst = getWorstStatus(emp);
      if (worst === 'expired') counts.expired++;
      else if (worst === 'expiring') counts.expiring++;
      else if (worst === 'valid') counts.valid++;
    }
    return counts;
  }, [activeEmployees]);

  const filteredEmployees = useMemo(() => {
    let result = getFilteredEmployees(activeEmployees, filter, searchQuery);
    if (selectedRole) result = result.filter((emp) => emp.role === selectedRole);
    return result;
  }, [activeEmployees, filter, searchQuery, selectedRole]);

  // Paginação: evita renderizar centenas de cartões/linhas de uma vez só
  // quando a lista de colaboradores crescer.
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, selectedRole, viewMode]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEmployees.slice(start, start + PAGE_SIZE);
  }, [filteredEmployees, currentPage]);

  return {
    activeEmployees,
    trainingAlerts,
    dismissedEmployees,
    stats,
    statusCounts,
    filteredEmployees,
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedEmployees,
  };
}
