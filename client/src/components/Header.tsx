/*
 * Design: Industrial Blueprint — Neo-Industrial
 * Header: banner, identificação do sistema e ações.
 *
 * A barra de ações foi enxugada: fica visível só o essencial (alternar
 * visualização e a ação principal "Novo Colaborador"); o resto — relatórios,
 * contas, tema e sair — vive num único menu, evitando a fileira de sete botões
 * que existia antes.
 */

import {
  Plus,
  Download,
  Shield,
  FileText,
  LayoutGrid,
  List,
  Sun,
  Moon,
  Users,
  LogOut,
  MoreHorizontal,
  UserRoundX,
  Footprints,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  onShowDismissed?: () => void;
  onShowActivity?: () => void;
  dismissedCount?: number;
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
  onShowDismissed,
  onShowActivity,
  dismissedCount = 0,
}: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const scrolled = useScrolled(40);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const menuItemClass =
    'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed';

  const runAndClose = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    // Sem overflow-hidden aqui: o menu suspenso abre para fora do cabeçalho e
    // era recortado por ele. O arredondamento da imagem de fundo passou a ser
    // feito no próprio contêiner do fundo, logo abaixo.
    //
    // O z-50 quando o menu está aberto é necessário porque animate-fade-in-up
    // usa transform, o que cria um contexto de empilhamento: sem ele, o z-index
    // do menu só vale dentro do cabeçalho e os cartões seguintes (também
    // animados) ficavam por cima.
    <div
      className={`relative rounded-2xl shadow-lg mb-6 animate-fade-in-up ${
        menuOpen ? 'z-50' : ''
      }`}
    >
      {/* Fundo */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        <img src={HERO_IMAGE} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/95 via-navy/88 to-navy/65" />
      </div>

      {/* Marcas de registro (desenho técnico) */}
      <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-white/25 pointer-events-none hidden sm:block" />
      <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-white/25 pointer-events-none hidden sm:block" />
      <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-white/25 pointer-events-none hidden sm:block" />
      <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-white/25 pointer-events-none hidden sm:block" />

      <div
        className={`relative transition-[padding] duration-300 ${
          scrolled ? 'px-4 py-3 md:px-8 md:py-6' : 'px-5 py-5 md:px-8 md:py-7'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Identificação */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`bg-orange rounded-xl shadow-lg shrink-0 transition-all duration-300 ${
                scrolled ? 'p-1.5 md:p-2.5' : 'p-2 md:p-2.5'
              }`}
            >
              <Shield size={scrolled ? 20 : 24} className="text-white transition-all duration-300" />
            </div>
            <div className="min-w-0">
              <h1
                className={`font-display font-bold text-white tracking-tight leading-tight transition-all duration-300 ${
                  scrolled ? 'text-lg md:text-2xl' : 'text-xl md:text-3xl'
                }`}
              >
                Gestão de Treinamentos <span className="text-orange-light">LOM</span>
              </h1>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  scrolled ? 'max-h-0 opacity-0' : 'max-h-8 opacity-100'
                }`}
              >
                <p className="font-technical text-[11px] text-white/50 mt-1 truncate">
                  {employeeCount > 0 && (
                    <>
                      {employeeCount} colaborador{employeeCount !== 1 ? 'es' : ''}
                      <span className="mx-1.5 opacity-40">·</span>
                    </>
                  )}
                  {username || 'conectado'}
                </p>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 shrink-0">
            {onViewModeChange && (
              <div className="hidden sm:flex bg-white/10 p-1 rounded-xl gap-1 border border-white/15">
                <button
                  onClick={() => onViewModeChange('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid' ? 'bg-orange text-white' : 'text-white/60 hover:text-white'
                  }`}
                  title="Visualização em cartões"
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  onClick={() => onViewModeChange('table')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'table' ? 'bg-orange text-white' : 'text-white/60 hover:text-white'
                  }`}
                  title="Visualização em tabela"
                >
                  <List size={17} />
                </button>
              </div>
            )}

            {canEdit && (
              <button
                onClick={onNewEmployee}
                className="bg-orange hover:bg-orange-light text-white pl-3 pr-3 sm:pr-4 py-2.5 rounded-xl shadow-lg shadow-orange/20 transition-all flex items-center gap-2 font-bold text-sm"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Novo Colaborador</span>
              </button>
            )}

            {/* Menu: relatórios, contas, tema e sair */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Mais opções"
                className={`p-2.5 rounded-xl border transition-all ${
                  menuOpen
                    ? 'bg-white text-navy border-white'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                }`}
              >
                <MoreHorizontal size={18} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 bg-card rounded-xl shadow-2xl border border-border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  {username && (
                    <div className="px-3.5 py-2.5 border-b border-border">
                      <p className="font-technical text-[10px] uppercase tracking-wider text-muted-foreground">
                        Conectado como
                      </p>
                      <p className="text-sm font-semibold text-foreground truncate">{username}</p>
                    </div>
                  )}

                  {canImportExport && (
                    <div className="py-1 border-b border-border">
                      <button onClick={runAndClose(onExportPDF)} disabled={isSyncing} className={menuItemClass} role="menuitem">
                        <FileText size={16} className="text-muted-foreground" />
                        Relatório em PDF
                      </button>
                      <button onClick={runAndClose(onExport)} disabled={isSyncing} className={menuItemClass} role="menuitem">
                        <Download size={16} className="text-muted-foreground" />
                        Exportar para Excel
                      </button>
                    </div>
                  )}

                  <div className="py-1 border-b border-border">
                    {onShowDismissed && (
                      <button onClick={runAndClose(onShowDismissed)} className={menuItemClass} role="menuitem">
                        <UserRoundX size={16} className="text-muted-foreground" />
                        Demitidos
                        {dismissedCount > 0 && (
                          <span className="ml-auto font-technical text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                            {dismissedCount}
                          </span>
                        )}
                      </button>
                    )}
                    {onShowActivity && (
                      <button onClick={runAndClose(onShowActivity)} className={menuItemClass} role="menuitem">
                        <Footprints size={16} className="text-muted-foreground" />
                        Rastros dos usuários
                      </button>
                    )}
                    {onManageAdmins && (
                      <button onClick={runAndClose(onManageAdmins)} className={menuItemClass} role="menuitem">
                        <Users size={16} className="text-muted-foreground" />
                        Contas e permissões
                      </button>
                    )}
                    {toggleTheme && (
                      <button onClick={runAndClose(toggleTheme)} className={menuItemClass} role="menuitem">
                        {theme === 'dark' ? (
                          <Sun size={16} className="text-muted-foreground" />
                        ) : (
                          <Moon size={16} className="text-muted-foreground" />
                        )}
                        {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                      </button>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      onClick={runAndClose(onLogout)}
                      className={`${menuItemClass} text-danger`}
                      role="menuitem"
                    >
                      <LogOut size={16} />
                      Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
