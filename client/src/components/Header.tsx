/*
 * Design: Industrial Blueprint — Neo-Industrial
 * Header: Application header with hero banner, title, and action buttons
 */

import { Plus, Download, Shield, FileText, LayoutGrid, List, Sun, Moon, Users, UserCircle, LogOut } from 'lucide-react';
import HERO_IMAGE from '../assets/hero-banner.webp';
import { useTheme } from '@/contexts/ThemeContext';
import { useScrolled } from '@/hooks/useScrolled';

interface HeaderProps {
  onNewEmployee: () => void;
  onExport: () => void;
  onExportPDF: () => void;
  isSyncing: boolean;
  employeeCount: number;
  viewMode?: 'grid' | 'table';
  onViewModeChange?: (mode: 'grid' | 'table') => void;
  username?: string | null;
  onLogout: () => void;
  canEdit?: boolean;
  canImportExport?: boolean;
  onManageAdmins?: () => void;
}

export default function Header({ 
  onNewEmployee, 
  onExport, 
  onExportPDF, 
  isSyncing, 
  employeeCount,
  viewMode = 'grid',
  onViewModeChange,
  username,
  onLogout,
  canEdit = false,
  canImportExport = false,
  onManageAdmins,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const scrolled = useScrolled(40);

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-lg mb-8 animate-fade-in-up">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={HERO_IMAGE}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/85 to-navy/60" />
      </div>

      {/* Marcas de registro (estilo desenho técnico) — assinatura discreta do
          design "Industrial Blueprint" nos quatro cantos do painel. */}
      <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-white/25 pointer-events-none hidden sm:block" />
      <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-white/25 pointer-events-none hidden sm:block" />
      <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-white/25 pointer-events-none hidden sm:block" />
      <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-white/25 pointer-events-none hidden sm:block" />

      {/* Content */}
      <div className={`relative transition-[padding] duration-300 ${scrolled ? 'p-4 md:p-8 lg:p-10' : 'p-6 md:p-8 lg:p-10'}`}>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className={`bg-orange rounded-xl shadow-lg transition-all duration-300 ${scrolled ? 'p-1.5 md:p-2.5' : 'p-2.5'}`}>
                <Shield size={scrolled ? 22 : 28} className="text-white transition-all duration-300" />
              </div>
              <h1 className={`font-display font-bold text-white tracking-tight transition-all duration-300 ${scrolled ? 'text-xl md:text-4xl' : 'text-3xl md:text-4xl'}`}>
                Gestão de Treinamentos <span className="text-orange-light">LOM</span>
              </h1>
            </div>
            <div className={`overflow-hidden transition-all duration-300 lg:max-h-24 lg:opacity-100 ${scrolled ? 'max-h-0 opacity-0' : 'max-h-24 opacity-100'}`}>
              <p className="text-white/70 text-base mt-2 max-w-lg font-technical text-sm">
                {employeeCount > 0 && (
                  <span className="text-orange-light font-semibold">{employeeCount} colaborador{employeeCount !== 1 ? 'es' : ''} cadastrado{employeeCount !== 1 ? 's' : ''}</span>
                )}
              </p>
              <p className="text-white/40 text-xs mt-1 font-technical tracking-wide">
                Criado por Gilvando Santana
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center">
            {/* Theme Toggle Button */}
            {toggleTheme && (
              <button
                onClick={toggleTheme}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shadow-lg"
                title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}

            {/* Quem está logado + sair. O antigo botão de "Modo ADM" saiu:
                o acesso agora é definido pelo login e pelas permissões da
                conta, então não há mais um modo para ativar/desativar. */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 shadow-lg">
              <UserCircle size={18} className="text-white/70 shrink-0" />
              <span className="text-white text-sm font-semibold max-w-[120px] truncate">
                {username || 'Conectado'}
              </span>
              <button
                onClick={onLogout}
                title="Sair"
                className="text-white/60 hover:text-white transition-colors ml-1"
              >
                <LogOut size={16} />
              </button>
            </div>

            {onManageAdmins && (
              <button
                onClick={onManageAdmins}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shadow-lg"
                title="Gerenciar admins"
              >
                <Users size={18} />
              </button>
            )}

            <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block" />

            {onViewModeChange && (
              <div className="bg-white/10 p-1 rounded-xl flex gap-1 border border-white/10 mr-2">
                <button
                  onClick={() => onViewModeChange('grid')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-orange text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                  title="Visualização em Cartões"
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => onViewModeChange('table')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-orange text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                  title="Visualização em Tabela"
                >
                  <List size={18} />
                </button>
              </div>
            )}
            {canEdit && (
              <button
                onClick={onNewEmployee}
                className="bg-orange hover:bg-orange-light text-white px-5 py-2.5 rounded-xl shadow-lg shadow-orange/20 transition-all duration-200 flex items-center gap-2 font-bold text-sm animate-in fade-in zoom-in duration-300"
              >
                <Plus size={18} />
                Novo Colaborador
              </button>
            )}

            {canImportExport && (
              <>
                <button
                  onClick={onExportPDF}
                  disabled={isSyncing}
                  className="bg-white/15 hover:bg-white/25 border border-white/20 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl font-semibold text-sm"
                  title="Exportar relatório em PDF"
                >
                  <FileText size={18} />
                  PDF
                </button>

                <button
                  onClick={onExport}
                  disabled={isSyncing}
                  className="bg-white/15 hover:bg-white/25 border border-white/20 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl font-semibold text-sm"
                  title="Exportar dados para Excel"
                >
                  <Download size={18} />
                  Excel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
