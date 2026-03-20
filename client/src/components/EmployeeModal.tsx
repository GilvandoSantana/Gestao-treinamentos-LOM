/*
 * Design: Industrial Blueprint — Neo-Industrial
 * EmployeeModal: Full-featured modal for adding/editing employees and their trainings.
 * Navy header, form with predefined selects and custom input fallback.
 * Includes photo upload for employee profile.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Edit2, Trash2, User, Shield, Upload, File, Loader, Camera } from 'lucide-react';
import type { Employee, Training } from '@/lib/types';
import { PREDEFINED_TRAININGS, PREDEFINED_ROLES } from '@/lib/types';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface EmployeeModalProps {
  isOpen: boolean;
  employee: Employee | null;
  onSave: (employee: Employee) => void;
  onClose: () => void;
}

interface PendingCertificate {
  trainingId: string;
  file: File;
  base64: string;
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
  
  // Photo upload state
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Certificate upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingCertificates, setPendingCertificates] = useState<PendingCertificate[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const uploadMutation = trpc.certificates.upload.useMutation();
  const uploadPhotoMutation = trpc.employees.uploadPhoto.useMutation();

  useEffect(() => {
    if (employee) {
      setName(employee.name);
      setRegistration(employee.registration || '');
      setEducationLevel(employee.educationLevel || '');
      setAge(employee.age || undefined);
      setRole(employee.role);
      setPhotoPreview(employee.photoUrl || null);
      setShowCustomRole(!PREDEFINED_ROLES.includes(employee.role as any));
      setTrainings(employee.trainings || []);
    } else {
      setName('');
      setRegistration('');
      setEducationLevel('');
      setAge(undefined);
      setRole('');
      setPhotoPreview(null);
      setShowCustomRole(false);
      setTrainings([]);
    }
    resetTrainingForm();
    setPendingCertificates([]);
    setSelectedPhoto(null);
  }, [employee, isOpen]);

  const resetTrainingForm = () => {
    setTrainingName('');
    setShowCustomTraining(false);
    setCompletionDate('');
    setExpirationDate('');
    setEditingTraining(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('A foto deve ter menos de 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Selecione um arquivo de imagem válido');
        return;
      }
      setSelectedPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('O arquivo deve ter menos de 10MB');
        return;
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error('Formato não suportado. Use: PDF, JPG, PNG, DOC, DOCX');
        return;
      }

      setSelectedFile(file);
    }
  };

  const addTraining = () => {
    if (!trainingName.trim() || !completionDate || !expirationDate) {
      return;
    }

    const trainingId = editingTraining ? editingTraining.id : Date.now().toString();

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = () => {
        const fileData = reader.result as string;
        const base64Data = fileData.split(',')[1];
        
        setPendingCertificates(prev => {
          const filtered = prev.filter(p => p.trainingId !== trainingId);
          return [...filtered, {
            trainingId,
            file: selectedFile,
            base64: base64Data
          }];
        });
      };
      reader.readAsDataURL(selectedFile);
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
        id: trainingId,
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
    
    const pending = pendingCertificates.find(p => p.trainingId === training.id);
    if (pending) {
      setSelectedFile(pending.file);
    } else {
      setSelectedFile(null);
    }
  };

  const removeTraining = (id: string) => {
    setTrainings((prev) => prev.filter((t) => t.id !== id));
    setPendingCertificates(prev => prev.filter(p => p.trainingId !== id));
    if (editingTraining?.id === id) {
      resetTrainingForm();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!role.trim()) return;

    setIsUploading(true);
    const employeeId = employee?.id || Date.now().toString();

    try {
      // 1. Upload photo if selected
      if (selectedPhoto) {
        toast.info('Enviando foto do colaborador...');
        const reader = new FileReader();
        const photoBase64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(selectedPhoto);
        });

        await uploadPhotoMutation.mutateAsync({
          employeeId: employeeId,
          fileData: photoBase64,
          mimeType: selectedPhoto.type,
        });
      }

      // 2. Save employee
      onSave({
        id: employeeId,
        name: name.trim(),
        registration: registration.trim() || undefined,
        educationLevel: educationLevel || undefined,
        age: age || undefined,
        role: role.trim(),
        trainings,
      });

      // 3. Upload pending certificates
      if (pendingCertificates.length > 0) {
        toast.info(`Enviando ${pendingCertificates.length} certificado(s)...`);
        
        for (const pending of pendingCertificates) {
          try {
            await uploadMutation.mutateAsync({
              trainingId: pending.trainingId,
              employeeId: employeeId,
              fileName: pending.file.name,
              fileData: pending.base64,
              mimeType: pending.file.type,
            });
          } catch (err) {
            console.error(`Erro ao enviar certificado para ${pending.trainingId}:`, err);
            toast.error(`Falha ao enviar certificado: ${pending.file.name}`);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao processar o cadastro');
    } finally {
      setIsUploading(false);
    }
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
            disabled={isUploading}
            className="text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-lg transition-all disabled:opacity-50"
          >
            <X size={22} />
          </button>
        </div>

        {/* Form Body */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-6">
          {/* Photo Upload Section */}
          <div className="flex flex-col items-center mb-6">
            <div 
              className="relative group cursor-pointer"
              onClick={() => photoInputRef.current?.click()}
            >
              <div className="w-32 h-32 rounded-full border-4 border-muted overflow-hidden bg-muted flex items-center justify-center transition-all group-hover:border-orange">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <User size={64} className="text-muted-foreground" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 bg-orange text-white p-2 rounded-full shadow-lg transition-transform group-hover:scale-110">
                <Camera size={20} />
              </div>
              <input
                ref={photoInputRef}
                type="file"
                onChange={handlePhotoSelect}
                accept="image/jpeg,image/jpg,image/png"
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Clique para adicionar foto (JPG, JPEG, PNG)</p>
          </div>

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

              {/* Certificate Upload Area */}
              <div>
                <label className="block text-foreground font-semibold mb-2 text-sm">
                  Certificado (Opcional)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-input rounded-lg p-6 text-center cursor-pointer hover:border-orange hover:bg-orange/5 transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden"
                  />

                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <File className="text-orange mb-2" size={28} />
                      <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="text-muted-foreground mb-2" size={28} />
                      <p className="text-sm font-medium text-foreground">Clique para adicionar certificado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, JPG, PNG, DOC, DOCX (Max 10MB)
                      </p>
                    </div>
                  )}
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
                {trainings.map((training) => {
                  const hasPendingCert = pendingCertificates.some(p => p.trainingId === training.id);
                  return (
                    <div
                      key={training.id}
                      className="flex justify-between items-start bg-muted p-3 rounded-lg group/item"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground text-sm truncate">{training.name}</p>
                          {hasPendingCert && (
                            <span className="bg-orange/10 text-orange text-[10px] px-1.5 py-0.5 rounded border border-orange/20 flex items-center gap-1">
                              <File size={10} />
                              Certificado pronto
                            </span>
                          )}
                        </div>
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
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-border shrink-0 bg-card">
          <button
            onClick={handleSave}
            disabled={!name.trim() || !role.trim() || isUploading}
            className="flex-1 bg-navy hover:bg-navy-light disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Processando...
              </>
            ) : (
              employee ? 'Salvar Alterações' : 'Cadastrar Colaborador'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="flex-1 bg-muted hover:bg-warm-gray-dark text-foreground py-3 rounded-xl font-bold transition-all text-sm disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
