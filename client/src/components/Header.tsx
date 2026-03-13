/*
 * Design: Industrial Blueprint — Neo-Industrial
 * Header: Application header with hero banner, title, and action buttons
 */

import { Plus, Download, Shield, FileText } from 'lucide-react';
import HERO_IMAGE from '../assets/hero-banner.webp';

interface HeaderProps {
  onNewEmployee: () => void;
  onExport: () => void;
  onExportPDF: () => void;
  isSyncing: boolean;
  employeeCount: number;
}

export default function Header({ onNewEmployee, onExport, onExportPDF, isSyncing, employeeCount }: HeaderProps) {
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

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={onNewEmployee}
              className="bg-orange hover:bg-orange-light text-white px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:shadow-xl font-bold text-sm order-first"
            >
              <Plus size={18} />
              Novo Colaborador
            </button>

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
