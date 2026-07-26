/*
 * Home: Página principal do sistema de gestão de treinamentos.
 * Palette: navy (#1a2332), orange (#e8772e), teal (#2d9f7f), warm gray (#f4f1ed)
 */

import { useState, useEffect, useRef, useMemo } from 'react';
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
import EmployeeCard from '@/components/EmployeeCardWithCertificates';
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

  // Impede que o listQuery sobrescreva dados logo após um save
  const isSavingRef = useRef(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalReason, setPasswordModalReason] = useState<'login' | 'delete'>('login');
  const [selectedEmployeeForAudit, setSelectedEmployeeForAudit] = useState<Employee | null>(null);
  const [searchBy, setSearchBy] = useState<'name' | 'all'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC mutations e queries
  const upsertOneMutation = trpc.employees.upsertOne.useMutation();
  const syncMutation = trpc.employees.sync.useMutation();
  const deleteMutation = trpc.employees.delete.useMutation();
  const listQuery = trpc.employees.list.useQuery(undefined, {
    refetchInterval: 30000, // Busca do servidor a cada 30 segundos
    refetchOnWindowFocus: false,
  });

  // Verifica autenticação ao montar
  useEffect(() => {
    const auth = sessionStorage.getItem('training-manager-auth');
    if (auth === 'true') setIsAuthenticated(true);
  }, []);

  // Carrega dados iniciais do localStorage enquanto o servidor responde
  useEffect(() => {
    seedEmployees();

    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('training-manager:employee:')) {
        keys.push(key.replace('training-manager:', ''));
      }
    }

    if (keys.length > 0) {
      const employeeData: Employee[] = [];
      for (const key of keys) {
        const value = localStorage.getItem('training-manager:' + key);
        if (value) {
          try {
            const employee: Employee = JSON.parse(value);
            if (employee.trainings) {
              employee.trainings = employee.trainings.map((t) => ({
                ...t,
                completionDate:
                  t.completionDate || t.expirationDate || new Date().toISOString().split('T')[0],
              }));
            }
            employeeData.push(employee);
          } catch {}
        }
      }
      employeeData.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(employeeData);
    }

    setIsLoading(false);
  }, []);

  // Atualiza estado local quando o servidor responde — ignorado durante saves
  useEffect(() => {
    if (isSavingRef.current) return;
    if (listQuery.data && listQuery.data.length > 0) {
      setEmployees(listQuery.data as Employee[]);
      setIsLoading(false);
    }
  }, [listQuery.data]);

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
      // Bloqueia o listQuery de sobrescrever enquanto salvamos
      isSavingRef.current = true;

      // Atualiza estado local imediatamente para UI responsiva
      setEmployees(prev => {
        const index = prev.findIndex(e => e.id === employeeData.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = employeeData;
          return updated;
        }
        return [...prev, employeeData].sort((a, b) => a.name.localeCompare(b.name));
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

      // Salva apenas este colaborador no servidor (evita sobrescrever dados de outros)
      try {
        await upsertOneMutation.mutateAsync({
          id: employeeData.id,
          name: employeeData.name,
          registration: employeeData.registration,
          educationLevel: employeeData.educationLevel,
          age: employeeData.age,
          role: employeeData.role,
          phone: employeeData.phone,
          trainings: employeeData.trainings,
        });
        setLastSyncTime(new Date());
        setSyncError(null);
      } catch (err) {
        console.error('Erro ao sincronizar:', err);
        setSyncError('Falha na sincronização');
      } finally {
        // Libera o bloqueio após 3s para o listQuery voltar a funcionar
        setTimeout(() => { isSavingRef.current = false; }, 3000);
      }
    } catch (error) {
      isSavingRef.current = false;
      toast.error('Erro ao salvar colaborador. Tente novamente.');
      console.error(error);
    }
  };

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    if (passwordModalReason === 'login') {
      setIsAuthenticated(true);
      sessionStorage.setItem('training-manager-auth', 'true');
    } else if (passwordModalReason === 'delete' && deleteConfirmId) {
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
    if (deleteConfirmId) await deleteEmployeeConfirmed();
  };

  const deleteEmployeeConfirmed = async () => {
    if (!deleteConfirmId) return;
    try {
      setEmployees(prev => prev.filter(e => e.id !== deleteConfirmId));
      await deleteMutation.mutateAsync({ id: deleteConfirmId });
      localStorage.removeItem(`training-manager:employee:${deleteConfirmId}`);
      setDeleteConfirmId(null);
      setShowDeleteConfirm(false);
      toast.success('Colaborador excluído com sucesso!');
      setLastSyncTime(new Date());
      setSyncError(null);
    } catch (error) {
      toast.error('Erro ao excluir colaborador');
      console.error(error);
      await listQuery.refetch();
    }
  };

  const exportData = async () => {
    try {
      setIsSyncing(true);
      const excelData: any[] = [];

      employees.forEach(emp => {
        if (emp.trainings && emp.trainings.length > 0) {
          emp.trainings.forEach(training => {
            excelData.push({
              'Nome': emp.name || '',
              'Função': emp.role || '',
              'Treinamento': training.name || '',
              'Data de Realização': training.completionDate
                ? new Date(training.completionDate).toLocaleDateString('pt-BR') : '',
              'Validade': training.expirationDate
                ? new Date(training.expirationDate).toLocaleDateString('pt-BR') : '',
            });
          });
        } else {
          excelData.push({
            'Nome': emp.name || '',
            'Função': emp.role || '',
            'Treinamento': '',
            'Data de Realização': '',
            'Validade': '',
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Treinamentos');
      ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 15 }];
      XLSX.writeFile(wb, `treinamentos_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Dados exportados para Excel com sucesso!');
    } catch (error) {
      toast.error('Erro ao exportar dados para Excel.');
      console.error(error);
    } finally {
      setIsSyncing(false);
    }
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

        const employeeData: Employee[] = importedData.employees.map((employee: Employee) => ({
          ...employee,
          trainings: (employee.trainings || []).map((t: any) => ({
            ...t,
            completionDate:
              t.completionDate || t.expirationDate || new Date().toISOString().split('T')[0],
          })),
        }));

        for (const employee of employeeData) {
          localStorage.setItem(
            `training-manager:employee:${employee.id}`,
            JSON.stringify(employee)
          );
        }

        const sorted = employeeData.sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(sorted);

        try {
          await syncMutation.mutateAsync({ employees: sorted });
        } catch (err) {
          console.error('Erro ao sincronizar após importação:', err);
        }

        toast.success(`Dados importados com sucesso! ${employeeData.length} colaborador(es) carregado(s).`);
      } catch (error) {
        toast.error('Erro ao importar dados. Verifique se o arquivo está correto.');
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
      console.error(error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrintFilter = async (filterType: FilterType) => {
    try {
      setIsSyncing(true);
      await generateFilteredPDF(employees, filterType);
      const labels: Record<FilterType, string> = {
        all: 'Todos', valid: 'Válidos', expiring: 'Próximos a Vencer', expired: 'Vencidos',
      };
      toast.success(`Relatório de ${labels[filterType]} gerado com sucesso!`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório PDF');
    } finally {
      setIsSyncing(false);
    }
  };

  const openModal = (employee: Employee | null = null) => {
    setEditingEmployee(employee);
    setShowModal(true);
  };

  // Memoizado para evitar recálculo em cada re-render
  const stats = useMemo(() => getStatistics(employees), [employees]);

  const filteredEmployees = useMemo(() => {
    let result = getFilteredEmployees(employees, filter, searchQuery);
    if (selectedRole) result = result.filter(emp => emp.role === selectedRole);
    return result;
  }, [employees, filter, searchQuery, selectedRole]);

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
      {showPasswordModal && (
        <PasswordModal
          isOpen={showPasswordModal}
          title={passwordModalReason === 'login' ? 'Acesso Administrativo' : 'Confirmar Exclusão'}
          description={
            passwordModalReason === 'login'
              ? 'Digite a senha para habilitar edições'
              : 'Digite a senha para confirmar a exclusão do colaborador'
          }
          onSuccess={handlePasswordSuccess}
          onCancel={handlePasswordCancel}
        />
      )}

      <div className="container py-6 md:py-8">
        {/* Input oculto para importação de JSON */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={importData}
          className="hidden"
        />

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

        <div className="mb-6">
          <SyncStatus lastSyncTime={lastSyncTime} isSyncing={isSyncing} syncError={syncError} />
        </div>

        <StatCards stats={stats} />
        <ComplianceCharts employees={employees} />
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
        <FilterBar filter={filter} onFilterChange={setFilter} onPrintFilter={handlePrintFilter} isAdmin={isAuthenticated} />

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

        <div className="mt-12 pb-8 text-center">
          <p className="text-muted-foreground text-xs font-medium">Gestão de Treinamentos</p>
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
        isAdmin={isAuthenticated}
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
          auditLogs={[]}
          employeeName={selectedEmployeeForAudit.name}
        />
      )}

      <TrainingNotifications employees={employees} />
    </div>
  );
}
