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

import Header from '@/components/Header';
import StatCards from '@/components/StatCards';
import FilterBar from '@/components/FilterBar';
import AdvancedSearch from '@/components/AdvancedSearch';
import SyncStatus from '@/components/SyncStatus';
import EmployeeCard from '@/components/EmployeeCard';
import EmployeeTable from '@/components/EmployeeTable';
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
import PasswordModal from '@/components/PasswordModal';

export default function Home() {
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
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalReason, setPasswordModalReason] = useState<'login' | 'delete'>('login');
  const [selectedEmployeeForAudit, setSelectedEmployeeForAudit] = useState<any>(null);
  const [searchBy, setSearchBy] = useState<'name' | 'all'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC mutations and queries
  const syncMutation = trpc.employees.sync.useMutation();
  const deleteMutation = trpc.employees.delete.useMutation();
  const listQuery = trpc.employees.list.useQuery(undefined, {
    refetchInterval: 5000, // Fetch from server every 5 seconds
    refetchOnWindowFocus: true,
  });

  // Check authentication on mount
  useEffect(() => {
    const auth = sessionStorage.getItem('training-manager-auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Load data on mount and set up auto-sync
  useEffect(() => {
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
  }, []);

  // Update local state when server data changes
  useEffect(() => {
    if (listQuery.data && listQuery.data.length > 0) {
      const serverEmployees = listQuery.data as Employee[];
      setEmployees(serverEmployees);
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
      const keys = await new Promise<string[]>((resolve) => {
        const result: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('training-manager:employee:')) {
            result.push(key.replace('training-manager:', ''));
          }
        }
        resolve(result);
      });

      if (keys && keys.length > 0) {
        const employeeData: Employee[] = [];
        for (const key of keys) {
          const value = localStorage.getItem('training-manager:' + key);
          if (value) {
            const employee: Employee = JSON.parse(value);
            if (employee.trainings) {
              employee.trainings = employee.trainings.map((t) => ({
                ...t,
                completionDate:
                  t.completionDate || t.expirationDate || new Date().toISOString().split('T')[0],
              }));
            }
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
    if (employees.length === 0) return;
    
    try {
      setIsSyncing(true);
      setSyncError(null);
      // Sync employees to server every 5 seconds
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
    try {
      console.log('Salvando colaborador:', employeeData);
      
      // Atualizar o estado local imediatamente para refletir as mudanças na UI
      setEmployees(prev => {
        const index = prev.findIndex(e => e.id === employeeData.id);
        if (index >= 0) {
          const newEmployees = [...prev];
          newEmployees[index] = employeeData;
          return newEmployees;
        } else {
          return [...prev, employeeData].sort((a, b) => a.name.localeCompare(b.name));
        }
      });

      localStorage.setItem(
        `training-manager:employee:${employeeData.id}`,
        JSON.stringify(employeeData)
      );
      
      setShowModal(false);
      setEditingEmployee(null);
      toast.success(
        editingEmployee ? 'Colaborador atualizado com sucesso!' : 'Colaborador cadastrado com sucesso!'
      );
      
      // Trigger immediate sync com a lista completa de colaboradores
      try {
        // Precisamos pegar a lista atualizada
        setEmployees(currentEmployees => {
          syncMutation.mutate({ employees: currentEmployees });
          return currentEmployees;
        });
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

  const handleDeleteClick = (employeeId: string) => {
    // Apenas abrir o DeleteConfirmModal, não o PasswordModal
    setDeleteConfirmId(employeeId);
    setShowDeleteConfirm(true);
  };

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    if (passwordModalReason === 'login') {
      setIsAuthenticated(true);
      sessionStorage.setItem('training-manager-auth', 'true');
    } else if (passwordModalReason === 'delete' && deleteConfirmId) {
      // Executar a exclusão confirmada
      deleteEmployeeConfirmed();
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    if (passwordModalReason === 'delete') {
      setDeleteConfirmId(null);
      setShowDeleteConfirm(false);
    }
  };

  const deleteEmployee = async () => {
    // Agora a exclusão é direta após a confirmação no DeleteConfirmModal
    if (deleteConfirmId) {
      await deleteEmployeeConfirmed();
    }
  };

  const deleteEmployeeConfirmed = async () => {
    if (!deleteConfirmId) return;

    try {
      // Atualizar o estado local imediatamente
      setEmployees(prev => prev.filter(e => e.id !== deleteConfirmId));
      
      await deleteMutation.mutateAsync({ id: deleteConfirmId });
      
      localStorage.removeItem(`training-manager:employee:${deleteConfirmId}`);
      
      setDeleteConfirmId(null);
      setShowDeleteConfirm(false);
      toast.success('Colaborador excluido com sucesso!');
      setLastSyncTime(new Date());
      setSyncError(null);
    } catch (error) {
      toast.error('Erro ao excluir colaborador');
      console.error(error);
      // Recarregar dados em caso de erro para restaurar o estado
      await listQuery.refetch();
    }
  };

  const exportData = async () => {
    try {
      setIsSyncing(true);
      
      // Debug: log dos dados disponíveis
      console.log('exportData chamada');
      console.log('listQuery.data:', listQuery.data);
      console.log('employees state:', employees);
      
      // Forçar recarregamento dos dados do servidor antes de exportar
      if (listQuery.data && listQuery.data.length > 0) {
        setEmployees(listQuery.data as Employee[]);
      }
      
      // Usar os dados mais recentes (que podem ter sido atualizados acima)
      const dataToExport = listQuery.data && listQuery.data.length > 0 ? (listQuery.data as Employee[]) : employees;
      console.log('dataToExport:', dataToExport);
      
      // Preparar dados para Excel - Uma linha por treinamento
      const excelData: any[] = [];
      console.log('Processando', dataToExport.length, 'colaboradores');
      console.log('Primeiro colaborador:', dataToExport[0]);
      
      dataToExport.forEach(emp => {
        if (emp.trainings && emp.trainings.length > 0) {
          // Se tem treinamentos, cria uma linha para cada um
          emp.trainings.forEach(training => {
            excelData.push({
              'Nome': emp.name || '',
              'Função': emp.role || '',
              'Treinamento': training.name || '',
              'Data de Realização': training.completionDate ? new Date(training.completionDate).toLocaleDateString('pt-BR') : '',
              'Validade': training.expirationDate ? new Date(training.expirationDate).toLocaleDateString('pt-BR') : '',
            });
          });
        } else {
          // Se não tem treinamentos, cria uma linha vazia para o colaborador
          excelData.push({
            'Nome': emp.name || '',
            'Função': emp.role || '',
            'Treinamento': '',
            'Data de Realização': '',
            'Validade': '',
          });
        }
      });

      // Criar workbook e worksheet
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Treinamentos');
      
      // Ajustar largura das colunas
      const colWidths = [
        { wch: 25 }, // Nome
        { wch: 20 }, // Função
        { wch: 30 }, // Treinamento
        { wch: 18 }, // Data de Realização
        { wch: 15 }, // Validade
      ];
      ws['!cols'] = colWidths;
      
      // Gerar arquivo Excel
      const fileName = `treinamentos_${new Date().toISOString().split('T')[0]}.xlsx`;
      console.log('Gerando arquivo:', fileName, 'com', excelData.length, 'linhas');
      console.log('Primeiras linhas do Excel:', excelData.slice(0, 3));
      XLSX.writeFile(wb, fileName);
      
      toast.success('Dados exportados para Excel com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados para Excel.');
      console.error('Erro na exportação:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const downloadFile = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `treinamentos_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Arquivo baixado com sucesso!');
  };

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);

        if (!importedData.employees || !Array.isArray(importedData.employees)) {
          toast.error('Arquivo inválido. Por favor, selecione um arquivo de backup válido.');
          setIsSyncing(false);
          return;
        }

        for (const employee of importedData.employees) {
          if (employee.trainings) {
            employee.trainings = employee.trainings.map((t: any) => ({
              ...t,
              completionDate:
                t.completionDate || t.expirationDate || new Date().toISOString().split('T')[0],
            }));
          }
          localStorage.setItem(
            `training-manager:employee:${employee.id}`,
            JSON.stringify(employee)
          );
        }

        await loadData();
        toast.success(
          `Dados importados com sucesso! ${importedData.employees.length} colaborador(es) carregado(s).`
        );
        // Trigger immediate sync
        try {
          await syncMutation.mutateAsync({ employees });
        } catch (err) {
          console.error('Erro ao sincronizar imediatamente:', err);
        }
      } catch (error) {
        toast.error('Erro ao importar dados. Verifique se o arquivo está correto.');
        console.error(error);
      }
      setIsSyncing(false);
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
  };

  const triggerFileImport = () => {
    fileInputRef.current?.click();
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
      const filterLabel = filterType === 'all' ? 'Todos' : filterType === 'valid' ? 'Validos' : filterType === 'expiring' ? 'Proximos a Vencer' : 'Vencidos';
      toast.success(`Relatorio de ${filterLabel} gerado com sucesso!`);
    } catch (error) {
      console.error('Erro ao gerar PDF filtrado:', error);
      toast.error('Erro ao gerar relatorio PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const openModal = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    setShowModal(true);
  };

  const stats = getStatistics(employees);
  let filteredEmployees = getFilteredEmployees(employees, filter, searchQuery);
  
  // Apply role filter
  if (selectedRole) {
    filteredEmployees = filteredEmployees.filter(emp => emp.role === selectedRole);
  }

  // Render password modal as an overlay
  const renderPasswordModal = showPasswordModal && (
    <PasswordModal
      isOpen={showPasswordModal}
      title={passwordModalReason === 'login' ? 'Acesso Administrativo' : 'Confirmar Exclusão'}
      description={passwordModalReason === 'login' ? 'Digite a senha para habilitar edições' : 'Digite a senha para confirmar a exclusão do colaborador'}
      onSuccess={handlePasswordSuccess}
      onCancel={handlePasswordCancel}
    />
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-navy/20 border-t-orange rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {renderPasswordModal}
      <div className="container py-6 md:py-8">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={importData}
          className="hidden"
        />

        {/* Header with hero */}
        <Header
          onNewEmployee={() => openModal()}
          onExport={exportData}
          onExportPDF={handleExportPDF}
          isSyncing={isSyncing}
          employeeCount={employees.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isAdmin={isAuthenticated}
          onAdminLogin={() => {
            setPasswordModalReason('login');
            setShowPasswordModal(true);
          }}
          onAdminLogout={() => {
            setIsAuthenticated(false);
            sessionStorage.removeItem('training-manager-auth');
            toast.info('Modo administrativo desativado.');
          }}
        />

        {/* Sync Status */}
        <div className="mb-6">
          <SyncStatus lastSyncTime={lastSyncTime} isSyncing={isSyncing} syncError={syncError} />
        </div>

        {/* Statistics */}
        <StatCards stats={stats} />

        {/* Compliance Charts */}
        <ComplianceCharts employees={employees} />

        {/* Expiring Notifications */}
        <ExpiringNotifications employees={employees} />

        {/* Advanced Search */}
        <AdvancedSearch
          searchTerm={searchQuery}
          onSearchChange={setSearchQuery}
          searchBy={searchBy}
          onSearchByChange={setSearchBy}
        />

        {/* Email History Panel */}
        <div className="mb-6">
          <EmailHistoryPanel />
        </div>

        {/* Role Filter */}
        <RoleFilter employees={employees} selectedRole={selectedRole} onRoleChange={setSelectedRole} />

        {/* Filters */}
        <FilterBar filter={filter} onFilterChange={setFilter} onPrintFilter={handlePrintFilter} />

        {/* Employee Cards or Table */}
        {filteredEmployees.length === 0 ? (
          <EmptyState filter={filter} />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredEmployees.map((employee, index) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                index={index}
                onEdit={(emp) => openModal(emp)}
                onDelete={(id) => {
                  setDeleteConfirmId(id);
                  setShowDeleteConfirm(true);
                }}
                onViewAudit={(emp) => {
                  setSelectedEmployeeForAudit(emp);
                  setShowAuditHistory(true);
                }}
                isAdmin={isAuthenticated}
              />
            ))}
          </div>
        ) : (
          <EmployeeTable
            employees={filteredEmployees}
            onEdit={(emp) => openModal(emp)}
            onDelete={(id) => {
              setDeleteConfirmId(id);
              setShowDeleteConfirm(true);
            }}
            onViewAudit={(emp) => {
              setSelectedEmployeeForAudit(emp);
              setShowAuditHistory(true);
            }}
            isAdmin={isAuthenticated}
          />
        )}

        {/* Footer */}
        <div className="mt-12 pb-8 text-center">
          <p className="text-muted-foreground text-xs font-medium">
            Gestão de Treinamentos
          </p>
        </div>
      </div>

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={showModal}
        employee={editingEmployee}
        onSave={saveEmployee}
        onClose={() => {
          setShowModal(false);
          setEditingEmployee(null);
        }}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        onConfirm={deleteEmployee}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeleteConfirmId(null);
        }}
      />

      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={showExcelImport}
        onClose={() => setShowExcelImport(false)}
        onImport={handleExcelImport}
      />

      {/* Audit History Modal */}
      {selectedEmployeeForAudit && (
        <AuditHistory
          isOpen={showAuditHistory}
          onClose={() => {
            setShowAuditHistory(false);
            setSelectedEmployeeForAudit(null);
          }}
          auditLogs={auditLogs}
          employeeName={selectedEmployeeForAudit.name}
        />
      )}

      {/* Training Notifications */}
      <TrainingNotifications employees={employees} />
    </div>
  );
}
