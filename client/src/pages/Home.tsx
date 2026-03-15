/*
 * Design: Industrial Blueprint — Neo-Industrial
 * Home: Main page orchestrating the training management dashboard.
 * Uses tRPC + backend database for multi-device synchronization every 5 seconds.
 * Palette: navy (#1a2332), orange (#e8772e), teal (#2d9f7f), warm gray (#f4f1ed)
 */

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { Employee, FilterType } from '@/lib/types';
import { getFilteredEmployees, getStatistics } from '@/lib/training-utils';
import { generateComprehensivePDF, generateFilteredPDF } from '@/lib/pdf-export';
import * as XLSX from 'xlsx';
import { seedEmployees } from '@/lib/seed-data';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

import Header from '@/components/Header';
import StatCards from '@/components/StatCards';
import FilterBar from '@/components/FilterBar';
import AdvancedSearch from '@/components/AdvancedSearch';
import SyncStatus from '@/components/SyncStatus';
import EmployeeCard from '@/components/EmployeeCard';
import EmployeeModal from '@/components/EmployeeModal';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import EmptyState from '@/components/EmptyState';
import ExcelImportModal from '@/components/ExcelImportModal';
import ComplianceCharts from '@/components/ComplianceCharts';
import ExpiringNotifications from '@/components/ExpiringNotifications';
import AuditHistory from '@/components/AuditHistory';
import RoleFilter from '@/components/RoleFilter';
import TrainingNotifications from '@/components/TrainingNotifications';
import EmailHistoryPanel from '@/components/EmailHistoryPanel';

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth({ redirectOnUnauthenticated: true });
  const isAdmin = user?.role === 'admin';
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [selectedEmployeeForAudit, setSelectedEmployeeForAudit] = useState<any>(null);
  const [searchBy, setSearchBy] = useState<'name' | 'all'>('name');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC mutations and queries
  const syncMutation = trpc.employees.sync.useMutation();
  const deleteMutation = trpc.employees.delete.useMutation();
  const listQuery = trpc.employees.list.useQuery(undefined, {
    refetchInterval: 5000, // Fetch from server every 5 seconds
    refetchOnWindowFocus: true,
    enabled: isAuthenticated,
  });

  // Load data on mount and set up auto-sync
  useEffect(() => {
    if (!isAuthenticated) return;

    seedEmployees();
    loadData();

    // Set up auto-sync every 5 seconds
    syncIntervalRef.current = setInterval(() => {
      syncToServer();
    }, 5000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isAuthenticated]);

  // Update local state when server data changes
  useEffect(() => {
    if (listQuery.data && listQuery.data.length > 0) {
      const serverEmployees = listQuery.data as Employee[];
      setEmployees(serverEmployees);
      setIsLoading(false);
    }
  }, [listQuery.data]);

  const loadData = async () => {
    try {
      // Try to load from server first
      if (listQuery.data && listQuery.data.length > 0) {
        const serverEmployees = listQuery.data as Employee[];
        setEmployees(serverEmployees);
        setIsLoading(false);
        return;
      }

      // Fallback to localStorage if server is empty
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('training-manager:employee:')) {
          keys.push(key);
        }
      }

      if (keys.length > 0) {
        const employeeData: Employee[] = [];
        for (const key of keys) {
          const value = localStorage.getItem(key);
          if (value) {
            const employee: Employee = JSON.parse(value);
            employeeData.push(employee);
          }
        }
        employeeData.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(employeeData);
      }
    } catch (error) {
      console.log('Nenhum dado anterior encontrado');
    }
    setIsLoading(false);
  };

  const syncToServer = async () => {
    if (employees.length === 0 || !isAdmin) return;
    
    try {
      setIsSyncing(true);
      setSyncError(null);
      await syncMutation.mutateAsync({ employees });
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      setSyncError('Falha na sincronização');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExcelImport = async (importedEmployees: Employee[]) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem importar dados.');
      return;
    }
    try {
      setIsSyncing(true);
      const mergedEmployees = [...employees];
      for (const imported of importedEmployees) {
        const existingIndex = mergedEmployees.findIndex(
          e => e.name.toLowerCase() === imported.name.toLowerCase()
        );
        if (existingIndex >= 0) {
          const existing = mergedEmployees[existingIndex];
          const newTrainings = imported.trainings.filter(
            t => !existing.trainings.some(et => et.name === t.name)
          );
          existing.trainings.push(...newTrainings);
        } else {
          mergedEmployees.push(imported);
        }
      }
      mergedEmployees.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(mergedEmployees);
      await syncMutation.mutateAsync({ employees: mergedEmployees });
      setLastSyncTime(new Date());
      toast.success(`${importedEmployees.length} colaborador(es) importado(s)!`);
    } catch (error) {
      toast.error('Erro ao importar colaboradores');
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveEmployee = async (employeeData: Employee) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem salvar alterações.');
      return;
    }
    try {
      localStorage.setItem(
        `training-manager:employee:${employeeData.id}`,
        JSON.stringify(employeeData)
      );
      
      // Update local state immediately
      setEmployees(prev => {
        const index = prev.findIndex(e => e.id === employeeData.id);
        if (index >= 0) {
          const newEmployees = [...prev];
          newEmployees[index] = employeeData;
          return newEmployees;
        }
        return [...prev, employeeData].sort((a, b) => a.name.localeCompare(b.name));
      });

      setShowModal(false);
      setEditingEmployee(null);
      toast.success(
        editingEmployee ? 'Colaborador atualizado com sucesso!' : 'Colaborador cadastrado com sucesso!'
      );
      
      // Trigger immediate sync
      try {
        await syncMutation.mutateAsync({ employees: [employeeData] });
        setLastSyncTime(new Date());
        setSyncError(null);
      } catch (err) {
        console.error('Erro ao sincronizar imediatamente:', err);
        setSyncError('Falha na sincronização');
      }
    } catch (error) {
      toast.error('Erro ao salvar colaborador. Tente novamente.');
      console.error(error);
    }
  };

  const deleteEmployee = async () => {
    if (!deleteConfirmId || !isAdmin) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteConfirmId });
      
      localStorage.removeItem(`training-manager:employee:${deleteConfirmId}`);
      setEmployees(prev => prev.filter(e => e.id !== deleteConfirmId));
      
      setDeleteConfirmId(null);
      setShowDeleteConfirm(false);
      toast.success('Colaborador excluido com sucesso!');
      setLastSyncTime(new Date());
      setSyncError(null);
    } catch (error) {
      toast.error('Erro ao excluir colaborador');
      console.error(error);
    }
  };

  const exportData = () => {
    const data = {
      employees,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `treinamentos_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Backup gerado com sucesso!');
  };

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem importar dados.');
      return;
    }
    const file = event?.target?.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);

        if (!importedData.employees || !Array.isArray(importedData.employees)) {
          toast.error('Arquivo inválido.');
          setIsSyncing(false);
          return;
        }

        for (const employee of importedData.employees) {
          localStorage.setItem(
            `training-manager:employee:${employee.id}`,
            JSON.stringify(employee)
          );
        }

        await loadData();
        toast.success(`Dados importados com sucesso!`);
        await syncMutation.mutateAsync({ employees: importedData.employees });
      } catch (error) {
        toast.error('Erro ao importar dados.');
        console.error(error);
      }
      setIsSyncing(false);
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
  };

  const handleExportPDF = async () => {
    try {
      setIsSyncing(true);
      await generateComprehensivePDF(employees);
      toast.success('Relatório PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrintFilter = async (filterType: FilterType) => {
    try {
      setIsSyncing(true);
      await generateFilteredPDF(employees, filterType);
      toast.success(`Relatorio gerado com sucesso!`);
    } catch (error) {
      console.error('Erro ao gerar PDF filtrado:', error);
      toast.error('Erro ao gerar relatorio PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const openModal = (employee: Employee | null = null) => {
    if (!isAdmin) {
      toast.error('Apenas administradores podem realizar esta ação.');
      return;
    }
    setEditingEmployee(employee);
    setShowModal(true);
  };

  const stats = getStatistics(employees);
  let filteredEmployees = getFilteredEmployees(employees, filter, searchQuery);
  
  if (selectedRole) {
    filteredEmployees = filteredEmployees.filter(emp => emp.role === selectedRole);
  }

  if (loading || (isAuthenticated && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-navy/20 border-t-orange rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">Carregando Gestão LOM...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 md:py-8">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={importData}
          className="hidden"
        />

        <Header
          isAdmin={isAdmin}
          onNewEmployee={() => openModal()}
          onExport={exportData}
          onImport={() => fileInputRef.current?.click()}
          onExportPDF={handleExportPDF}
          onExcelImport={() => setShowExcelImport(true)}
          isSyncing={isSyncing}
          employeeCount={employees.length}
        />

        <div className="mb-6">
          <SyncStatus lastSyncTime={lastSyncTime} isSyncing={isSyncing} syncError={syncError} />
        </div>

        <StatCards stats={stats} />
        <ComplianceCharts employees={employees} />
        <TrainingNotifications employees={employees} />
        <ExpiringNotifications employees={employees} />

        <AdvancedSearch
          searchTerm={searchQuery}
          onSearchChange={setSearchQuery}
          searchBy={searchBy}
          onSearchByChange={setSearchBy}
        />

        <div className="mb-6">
          <EmailHistoryPanel />
        </div>

        <RoleFilter employees={employees} selectedRole={selectedRole} onRoleChange={setSelectedRole} />
        <FilterBar filter={filter} onFilterChange={setFilter} onPrintFilter={handlePrintFilter} />

        {filteredEmployees.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredEmployees.map((employee, index) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                index={index}
                isAdmin={isAdmin}
                onEdit={(emp) => openModal(emp)}
                onDelete={(id) => {
                  setDeleteConfirmId(id);
                  setShowDeleteConfirm(true);
                }}
                onViewAudit={(emp) => {
                  setSelectedEmployeeForAudit(emp);
                  setShowAuditHistory(true);
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-12 pb-8 text-center">
          <p className="text-muted-foreground text-xs font-medium">
            Gestão de Treinamentos LOM - {user?.email} ({user?.role})
          </p>
        </div>
      </div>

      <EmployeeModal
        isOpen={showModal}
        employee={editingEmployee}
        onSave={saveEmployee}
        onClose={() => {
          setShowModal(false);
          setEditingEmployee(null);
        }}
      />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onConfirm={deleteEmployee}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteConfirmId(null);
        }}
      />

      <ExcelImportModal
        isOpen={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        onImport={handleExcelImport}
      />

      {selectedEmployeeForAudit && (
        <AuditHistory
          isOpen={showAuditHistory}
          onClose={() => {
            setShowAuditHistory(false);
            setSelectedEmployeeForAudit(null);
          }}
          employee={selectedEmployeeForAudit}
        />
      )}
    </div>
  );
}
