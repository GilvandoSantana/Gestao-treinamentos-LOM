/*
 * Home: Página principal do sistema de gestão de treinamentos.
 * Palette: navy (#1a2332), orange (#e8772e), teal (#2d9f7f), warm gray (#f4f1ed)
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import type { Employee, FilterType } from '@/lib/types';
import { getFilteredEmployees, getStatistics, getWorstStatus } from '@/lib/training-utils';
import { generateComprehensivePDF, generateFilteredPDF } from '@/lib/pdf-export';
import * as XLSX from 'xlsx';
import { trpc } from '@/lib/trpc';

import Header from '@/components/Header';
import AdminManagementModal from '@/components/AdminManagementModal';
import DismissedModal from '@/components/DismissedModal';
import DismissConfirmModal from '@/components/DismissConfirmModal';
import SwipeActions from '@/components/SwipeActions';
import MobileNav, { type MobileTab } from '@/components/MobileNav';
import LoginPage from '@/pages/LoginPage';
import { useSiteSession } from '@/hooks/useSiteSession';
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
  const [showAdminManagement, setShowAdminManagement] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  // Confirmação antes de demitir/readmitir, no mesmo padrão da exclusão.
  const [dismissConfirm, setDismissConfirm] = useState<{ employee: Employee; dismissing: boolean } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('colaboradores');
  const [selectedEmployeeForAudit, setSelectedEmployeeForAudit] = useState<Employee | null>(null);
  const [searchBy, setSearchBy] = useState<'name' | 'all'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC mutations e queries
  const upsertOneMutation = trpc.employees.upsertOne.useMutation();
  const syncMutation = trpc.employees.sync.useMutation();
  const deleteMutation = trpc.employees.delete.useMutation();
  // Sessão do site (quem é, papel e permissões). O site inteiro fica atrás
  // do login — nada é exibido antes de entrar.
  const session = useSiteSession();
  const utils = trpc.useUtils();

  const listQuery = trpc.employees.list.useQuery(undefined, {
    // Só busca depois que há sessão válida. Antes a consulta disparava junto
    // com o carregamento da página, ainda sem login, falhava com "não
    // autorizado" e ficava presa nesse erro mesmo depois de entrar — era o
    // erro que aparecia logo após o login e sumia ao clicar em "tentar
    // novamente".
    enabled: session.isLoggedIn,
    // Antes buscava do servidor a cada 30s por polling fixo; agora só
    // recarrega quando uma mutação (salvar/excluir/sincronizar) termina,
    // reduzindo carga no banco sem perder atualização.
    refetchOnWindowFocus: false,
  });
  const siteLogoutMutation = trpc.auth.siteLogout.useMutation();
  const setDismissedMutation = trpc.employees.setDismissed.useMutation();

  // Carrega dados reais assim que o servidor responde (o app não guarda mais
  // um "cache" de colaboradores no localStorage do navegador para evitar
  // mostrar uma contagem antiga/de teste antes da real).
  useEffect(() => {
    if (isSavingRef.current) return;
    if (!session.isLoggedIn) return;
    if (listQuery.isSuccess) {
      setEmployees((listQuery.data ?? []) as Employee[]);
      setIsLoading(false);
    } else if (listQuery.isError) {
      setIsLoading(false);
    }
  }, [listQuery.data, listQuery.isSuccess, listQuery.isError, session.isLoggedIn]);

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
      await listQuery.refetch();
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
        await listQuery.refetch();
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

  /** Abre a confirmação; a ação em si roda em confirmSetDismissed. */
  const requestSetDismissed = (employee: Employee, dismissed: boolean) => {
    setDismissConfirm({ employee, dismissing: dismissed });
  };

  const confirmSetDismissed = async () => {
    if (!dismissConfirm) return;
    const { employee, dismissing: dismissed } = dismissConfirm;
    try {
      await setDismissedMutation.mutateAsync({ id: employee.id, dismissed });
      await listQuery.refetch();
      toast.success(
        dismissed
          ? `${employee.name} foi movido para Demitidos.`
          : `${employee.name} voltou para a lista ativa.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setDismissConfirm(null);
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
          await listQuery.refetch();
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
  // Demitidos ficam fora de tudo: listas, filtros, contagens e estatísticas.
  // O registro continua no banco, apenas não entra no dia a dia.
  const activeEmployees = useMemo(() => employees.filter((e) => !e.dismissed), [employees]);
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
    if (selectedRole) result = result.filter(emp => emp.role === selectedRole);
    return result;
  }, [activeEmployees, filter, searchQuery, selectedRole]);

  // Paginação: evita renderizar centenas de cartões/linhas de uma vez só
  // quando a lista de colaboradores crescer.
  const PAGE_SIZE = 24;
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

  // Porta de entrada: sem sessão válida, só a tela de login.
  // A verificação da sessão vem ANTES do carregamento da lista: enquanto não
  // há login, não existe lista para carregar, e checar na ordem inversa
  // deixava a página presa em "Carregando..." sem nunca mostrar o login.
  if (session.isLoading) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="text-white/60 font-technical text-sm">Carregando...</div>
      </div>
    );
  }

  if (!session.isLoggedIn) {
    return (
      <LoginPage
        onSuccess={async () => {
          // Recarrega a sessão e limpa o cache de consultas para que a lista
          // seja buscada já com o cookie novo, sem passar por um estado de erro.
          await session.refetch();
          await utils.invalidate();
        }}
      />
    );
  }

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
          employeeCount={activeEmployees.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          username={session.username}
          canEdit={session.can('editEmployees')}
          canImportExport={session.can('importExport')}
          onLogout={async () => {
            try {
              await siteLogoutMutation.mutateAsync();
            } catch (error) {
              console.error('Erro ao encerrar sessão:', error);
            }
            await session.refetch();
            await utils.invalidate();
            toast.info('Sessão encerrada.');
          }}
          onManageAdmins={session.isMasterAdmin ? () => setShowAdminManagement(true) : undefined}
          onShowDismissed={() => setShowDismissed(true)}
          dismissedCount={dismissedEmployees.length}
        />

        {showAdminManagement && (
          <AdminManagementModal
            isOpen={showAdminManagement}
            onClose={() => setShowAdminManagement(false)}
            currentUsername={session.username}
          />
        )}

        <div className="mb-6">
          <SyncStatus lastSyncTime={lastSyncTime} isSyncing={isSyncing} syncError={syncError} />
        </div>

        <StatCards stats={stats} />
        <ComplianceCharts employees={activeEmployees} />
        <ExpiringNotifications employees={activeEmployees} />

        <AdvancedSearch
          searchTerm={searchQuery}
          onSearchChange={setSearchQuery}
          searchBy={searchBy}
          onSearchByChange={setSearchBy}
        />

        <div className="mb-6">
          <EmailHistoryPanel />
        </div>

        <RoleFilter employees={activeEmployees} selectedRole={selectedRole} onRoleChange={setSelectedRole} />
        {/* No celular as situações viraram abas da barra inferior, então as
            pílulas só aparecem no desktop, onde essa barra não existe. */}
        <div className="hidden lg:block">
          <FilterBar
            filter={filter}
            onFilterChange={setFilter}
            onPrintFilter={handlePrintFilter}
            isAdmin={session.can('importExport')}
            employees={activeEmployees}
          />
        </div>

        {listQuery.isError ? (
          <div className="bg-card border border-danger/30 rounded-xl p-6 text-center">
            <p className="font-display font-bold text-danger text-lg mb-1">
              Não foi possível carregar os colaboradores
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              {listQuery.error?.message || 'Erro desconhecido ao consultar o servidor.'}
            </p>
            <button
              onClick={() => listQuery.refetch()}
              className="px-4 py-2 rounded-lg bg-orange text-white text-sm font-semibold hover:opacity-90"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <EmptyState filter={filter} />
        ) : viewMode === 'grid' ? (
          <div id="lista-colaboradores" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {paginatedEmployees.map((employee, index) => (
              <SwipeActions
                key={employee.id}
                enabled={session.can('editEmployees') || session.can('deleteEmployees')}
                onEdit={() => openModal(employee)}
                onDelete={() => {
                  setDeleteConfirmId(employee.id);
                  setShowDeleteConfirm(true);
                }}
              >
                <EmployeeCard
                  employee={employee}
                  index={index}
                  onEdit={(emp) => openModal(emp)}
                  onDelete={(id) => {
                    setDeleteConfirmId(id);
                    setShowDeleteConfirm(true);
                  }}
                  onDismiss={
                    session.can('editEmployees') ? (emp: Employee) => requestSetDismissed(emp, true) : undefined
                  }
                  onViewAudit={(emp) => {
                    setSelectedEmployeeForAudit(emp);
                    setShowAuditHistory(true);
                  }}
                  isAdmin={session.can('editEmployees')}
                />
              </SwipeActions>
            ))}
          </div>
        ) : (
          <EmployeeTable
            employees={paginatedEmployees}
            onEdit={(emp) => openModal(emp)}
            onDelete={(id) => {
              setDeleteConfirmId(id);
              setShowDeleteConfirm(true);
            }}
            onViewAudit={(emp) => {
              setSelectedEmployeeForAudit(emp);
              setShowAuditHistory(true);
            }}
            isAdmin={session.can('editEmployees')}
          />
        )}

        {filteredEmployees.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
            >
              Anterior
            </button>
            <span className="text-sm text-muted-foreground px-2">
              Página {currentPage} de {totalPages} · {filteredEmployees.length} colaborador{filteredEmployees.length !== 1 ? 'es' : ''}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
            >
              Próxima
            </button>
          </div>
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
        isAdmin={session.can('editEmployees')}
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

      <DismissedModal
        isOpen={showDismissed}
        onClose={() => setShowDismissed(false)}
        employees={dismissedEmployees}
        canEdit={session.can('editEmployees')}
        isRestoring={setDismissedMutation.isPending}
        onRestore={(emp) => requestSetDismissed(emp, false)}
        onEdit={
          session.can('editEmployees')
            ? (emp) => {
                setShowDismissed(false);
                openModal(emp);
              }
            : undefined
        }
      />

      <DismissConfirmModal
        isOpen={dismissConfirm !== null}
        dismissing={dismissConfirm?.dismissing ?? true}
        employeeName={dismissConfirm?.employee.name ?? ''}
        isProcessing={setDismissedMutation.isPending}
        onConfirm={confirmSetDismissed}
        onCancel={() => setDismissConfirm(null)}
      />

      <TrainingNotifications employees={activeEmployees} />

      {/* Navegação inferior (celular). Cada aba leva à seção correspondente
          da página, que já existe — não há troca de rota. */}
      <MobileNav
        active={mobileTab}
        counts={{
          vencidos: statusCounts.expired,
          vencendo: statusCounts.expiring,
          validos: statusCounts.valid,
        }}
        onSelect={(tab) => {
          const filterByTab: Record<MobileTab, FilterType> = {
            colaboradores: 'all',
            vencidos: 'expired',
            vencendo: 'expiring',
            validos: 'valid',
          };

          setMobileTab(tab);
          setFilter(filterByTab[tab]);
          if (tab === 'colaboradores') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            document.getElementById('lista-colaboradores')?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />

      {/* Espaço para a barra inferior não cobrir o fim da lista */}
      <div className="h-20 lg:hidden" />
    </div>
  );
}
