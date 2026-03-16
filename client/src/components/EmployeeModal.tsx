/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EmployeeModal: Full-featured modal for adding/editing employees and their trainings.
 * Navy header, form with predefined selects and custom input fallback.
 */

import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, User, Shield } from 'lucide-react';
import type { Employee, Training } from '@/lib/types';
import { PREDEFINED_TRAININGS, PREDEFINED_ROLES } from '@/lib/types';

interface EmployeeModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onSave: (employee: Employee) => void;
  onClose: () => void;
}

export default function EmployeeModal({ isOpen, employee, onSave, onClose }: EmployeeModalProps) {
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [age, setAge] = useState<number | undefined>(undefined);
  const [role, setRole] = useState('');
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [trainings, setTrainings] = useState<Training[]>([]);

  // New training form
  const [trainingName, setTrainingName] = useState('');
  const [showCustomTraining, setShowCustomTraining] = useState(false);
  const [completionDate, setCompletionDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [editingTraining, setEditingTraining] = useState<Training | null>(null);

  useEffect(() => {
    if (employee) {
      setName(employee.name);
      setRegistration(employee.registration || '');
      setEducationLevel(employee.educationLevel || '');
      setAge(employee.age || undefined);
      setRole(employee.role);
      setShowCustomRole(!PREDEFINED_ROLES.includes(employee.role as any));
      setTrainings(employee.trainings || []);
    } else {
      setName('');
      setRegistration('');
      setEducationLevel('');
      setAge(undefined);
      setRole('');
      setShowCustomRole(false);
      setTrainings([]);
    }
    resetTrainingForm();
  }, [employee, isOpen]);

  const resetTrainingForm = () => {
    setTrainingName('');
    setShowCustomTraining(false);
    setCompletionDate('');
    setExpirationDate('');
    setEditingTraining(null);
  };

  const handleRoleSelect = (value: string) => {
    if (value === 'CUSTOM') {
      setShowCustomRole(true);
      setRole('');
    } else {
      setShowCustomRole(false);
      setRole(value);
    }
  };

  const handleTrainingSelect = (value: string) => {
    if (value === 'CUSTOM') {
      setShowCustomTraining(true);
      setTrainingName('');
    } else {
      setShowCustomTraining(false);
      setTrainingName(value);
    }
  };

  const addTraining = () => {
    if (!trainingName.trim() || !completionDate || !expirationDate) {
      return;
    }

    if (editingTraining) {
      setTrainings((prev) =>
        prev
          .map((t) =>
            t.id === editingTraining.id
              ? { ...t, name: trainingName, completionDate, expirationDate }
              : t
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } else {
      const newTraining: Training = {
        id: Date.now().toString(),
        name: trainingName,
        completionDate,
        expirationDate,
      };
      setTrainings((prev) => [...prev, newTraining].sort((a, b) => a.name.localeCompare(b.name)));
    }
    resetTrainingForm();
  };

  const editTrainingItem = (training: Training) => {
    setEditingTraining(training);
    setTrainingName(training.name);
    setShowCustomTraining(!PREDEFINED_TRAININGS.includes(training.name as any));
    setCompletionDate(training.completionDate);
    setExpirationDate(training.expirationDate);
  };

  const removeTraining = (id: string) => {
    // Se o treinamento já existe no banco (não é um ID temporário de timestamp)
    // poderíamos chamar uma mutação aqui, mas o design atual sincroniza o objeto Employee inteiro.
    // Portanto, apenas remover da lista local e o saveEmployee cuidará do resto.
    setTrainings((prev) => prev.filter((t) => t.id !== id));
    if (editingTraining?.id === id) {
      resetTrainingForm();
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (!role.trim()) return;

    onSave({
      id: employee?.id || Date.now().toString(),
      name: name.trim(),
      registration: registration.trim() || undefined,
      educationLevel: educationLevel || undefined,
      age: age || undefined,
      role: role.trim(),
      trainings,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] flex flex-col animate-fade-in-up overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-navy to-navy-light p-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2 rounded-lg">
              <User size={22} className="text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {employee ? 'Editar Colaborador' : 'Novo Colaborador'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-lg transition-all"
          >
            <X size={22} />
          </button>
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-6">
          {/* Name & Registration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-semibold mb-2 text-sm">
                Nome do Colaborador
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                placeholder="Digite o nome"
              />
            </div>
            <div>
              <label className="block text-foreground font-semibold mb-2 text-sm">
                Matrícula
              </label>
              <input
                type="text"
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
                className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                placeholder="Número da matrícula"
              />
            </div>
          </div>

          {/* Education Level & Age */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-foreground font-semibold mb-2 text-sm">Nível de Escolaridade</label>
              <select
                value={educationLevel}
                onChange={(e) => setEducationLevel(e.target.value)}
                className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
              >
                <option value="">Selecione a escolaridade</option>
                <option value="Ensino Fundamental">Ensino Fundamental</option>
                <option value="Ensino Médio">Ensino Médio</option>
                <option value="Ensino Técnico">Ensino Técnico</option>
                <option value="Ensino Superior">Ensino Superior</option>
              </select>
            </div>
            <div>
              <label className="block text-foreground font-semibold mb-2 text-sm">Idade</label>
              <input
                type="number"
                value={age || ''}
                onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : undefined)}
                className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                placeholder="Digite a idade"
                min="1"
                max="120"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-foreground font-semibold mb-2 text-sm">Função</label>
            <select
              value={showCustomRole ? 'CUSTOM' : role}
              onChange={(e) => handleRoleSelect(e.target.value)}
              className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors mb-2"
            >
              <option value="">Selecione uma função</option>
              {PREDEFINED_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="CUSTOM">Digitar função personalizada</option>
            </select>
            {showCustomRole && (
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                placeholder="Digite a função personalizada"
              />
            )}
          </div>

          {/* Add Training Section */}
          <div className="border-t-2 border-border pt-6">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Shield size={20} className="text-orange" />
              {editingTraining ? 'Editar Treinamento' : 'Adicionar Treinamento'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-foreground font-semibold mb-2 text-sm">
                  Nome do Treinamento
                </label>
                <select
                  value={showCustomTraining ? 'CUSTOM' : trainingName}
                  onChange={(e) => handleTrainingSelect(e.target.value)}
                  className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors mb-2"
                >
                  <option value="">Selecione um treinamento</option>
                  {PREDEFINED_TRAININGS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="CUSTOM">Digitar treinamento personalizado</option>
                </select>
                {showCustomTraining && (
                  <input
                    type="text"
                    value={trainingName}
                    onChange={(e) => setTrainingName(e.target.value)}
                    className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                    placeholder="Digite o nome do treinamento"
                  />
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-foreground font-semibold mb-2 text-sm">
                    Data de Realização
                  </label>
                  <input
                    type="date"
                    value={completionDate}
                    onChange={(e) => setCompletionDate(e.target.value)}
                    className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-foreground font-semibold mb-2 text-sm">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full border-2 border-input rounded-lg p-3 focus:border-orange focus:outline-none bg-background text-foreground transition-colors"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={addTraining}
              disabled={!trainingName.trim() || !completionDate || !expirationDate}
              className="mt-4 bg-orange hover:bg-orange-light text-white disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all font-semibold text-sm w-full sm:w-auto justify-center"
            >
              <Plus size={18} />
              {editingTraining ? 'Atualizar Treinamento' : 'Adicionar Treinamento'}
            </button>
          </div>

          {/* Trainings List */}
          {trainings.length > 0 && (
            <div className="border-t-2 border-border pt-6">
              <h3 className="text-lg font-bold text-foreground mb-4">
                Treinamentos Cadastrados ({trainings.length})
              </h3>
              <div className="space-y-2">
                {trainings.map((training) => (
                  <div
                    key={training.id}
                    className="flex justify-between items-start bg-muted p-3 rounded-lg group/item"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{training.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Realizado: {new Date(training.completionDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vencimento: {new Date(training.expirationDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      <button
                        onClick={() => editTrainingItem(training)}
                        className="text-navy hover:bg-navy/10 p-2 rounded-lg transition-all"
                        title="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => removeTraining(training.id)}
                        className="text-danger hover:bg-danger/10 p-2 rounded-lg transition-all"
                        title="Remover"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-border shrink-0 bg-card">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !role.trim()}
            className="flex-1 bg-navy hover:bg-navy-light disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-all text-sm"
          >
            {employee ? 'Salvar Alterações' : 'Cadastrar Colaborador'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-muted hover:bg-warm-gray-dark text-foreground py-3 rounded-xl font-bold transition-all text-sm"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
