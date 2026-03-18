/*
 * Design: Industrial Blueprint — Neo-Industrial
 * Header: Application header with hero banner, title, and action buttons
 */

import { Plus, Download, Shield, FileText, LayoutGrid, List, Lock, Unlock } from 'lucide-react';
import HERO_IMAGE from '../assets/hero-banner.webp';

interface HeaderProps {
  onNewEmployee: () => void;
  onExport: () => void;
  onExportPDF: () => void;
  isSyncing: boolean;
  employeeCount: number;
  viewMode?: 'grid' | 'table';
  onViewModeChange?: (mode: 'grid' | 'table') => void;
  isAdmin: boolean;
  onAdminLogin: () => void;
  onAdminLogout: () => void;
}

export default function Header({ 
  onNewEmployee, 
  onExport, 
  onExportPDF, 
  isSyncing, 
  employeeCount,
  viewMode = 'grid',
  onViewModeChange,
  isAdmin,
  onAdminLogin,
  onAdminLogout
}: HeaderProps) {
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

      {/* Content */}
      <div className="relative p-6 md:p-8 lg:p-10">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-orange p-2.5 rounded-xl shadow-lg">
                <Shield size={28} className="text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                Bem-vindo ao Gestão de Treinamentos LOM
              </h1>
            </div>
            <p className="text-white/70 text-base mt-2 max-w-lg">
              Criado por Gilvando Santana.
              {employeeCount > 0 && (
                <span className="text-orange-light font-semibold"> {employeeCount} colaborador{employeeCount !== 1 ? 'es' : ''} cadastrado{employeeCount !== 1 ? 's' : ''}.</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center">
            {/* Admin Toggle Button */}
            <button
              onClick={isAdmin ? onAdminLogout : onAdminLogin}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                isAdmin 
                ? 'bg-teal hover:bg-teal-light text-white shadow-teal/20' 
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
              }`}
            >
              {isAdmin ? (
                <>
                  <Unlock size={18} />
                  Modo ADM Ativo
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Login ADM
                </>
              )}
            </button>

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
            {isAdmin && (
              <button
                onClick={onNewEmployee}
                className="bg-orange hover:bg-orange-light text-white px-5 py-2.5 rounded-xl shadow-lg shadow-orange/20 transition-all duration-200 flex items-center gap-2 font-bold text-sm animate-in fade-in zoom-in duration-300"
              >
                <Plus size={18} />
                Novo Colaborador
              </button>
            )}

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
          </div>
        </div>
      </div>
    </div>
  );
}
