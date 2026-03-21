import { X } from 'lucide-react';
import React from 'react';
import type { Employee } from '@/lib/types';

interface RoleFilterProps {
  employees: Employee[];
  selectedRole: string;
  onRoleChange: (role: string) => void;
}

export default function RoleFilter({ employees, selectedRole, onRoleChange }: RoleFilterProps) {
  // Extract unique roles from employees
  const uniqueRoles = Array.from(new Set(
    employees
      .map(emp => emp.role)
      .filter(role => role && role.trim() !== '')
  )).sort();

  return (
    <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="role-filter" className="text-sm font-semibold text-gray-700 whitespace-nowrap">
            Filtrar por Função:
          </label>
        </div>
        
        <div className="flex-grow flex items-center gap-2">
          <select
            id="role-filter"
            value={selectedRole}
            onChange={(e) => onRoleChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-orange focus:border-orange block p-2.5 transition-all"
          >
            <option value="">Todas as Funções</option>
            {uniqueRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          
          {selectedRole && (
            <button
              onClick={() => onRoleChange('')}
              className="p-2.5 text-orange hover:bg-orange/10 rounded-lg transition-colors"
              title="Limpar filtro"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      
      {uniqueRoles.length === 0 && (
        <p className="mt-2 text-xs text-gray-400 italic">Nenhuma função encontrada para filtrar.</p>
      )}
    </div>
  );
}
