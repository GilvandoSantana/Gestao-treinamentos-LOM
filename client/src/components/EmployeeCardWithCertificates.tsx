/**
 * EmployeeCardWithCertificates Component
 * Extended EmployeeCard with certificate upload and listing functionality
 */

import { Edit2, Trash2, Calendar, Shield, User, History, ChevronDown, Upload, FileText } from 'lucide-react';
import { useState } from 'react';
import type { Employee } from '@/lib/types';
import { getTrainingStatus, getWorstStatus } from '@/lib/training-utils';
import CertificateUploadModal from './CertificateUploadModal';
import CertificatesList from './CertificatesList';

interface EmployeeCardWithCertificatesProps {
  employee: Employee;
  index: number;
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
  onViewAudit?: (employee: Employee) => void;
  isAdmin?: boolean;
}

const statusBorderMap = {
  expired: 'border-l-danger',
  expiring: 'border-l-warning',
  valid: 'border-l-teal',
  none: 'border-l-muted-foreground',
};

const statusBgMap = {
  expired: 'bg-danger/10 text-danger border-danger/20',
  expiring: 'bg-warning/10 text-warning border-warning/20',
  valid: 'bg-success-light text-teal border-teal/20',
  unknown: 'bg-muted text-muted-foreground border-border',
};

const statusDotMap = {
  expired: 'bg-danger',
  expiring: 'bg-warning animate-pulse-soft',
  valid: 'bg-teal',
  unknown: 'bg-muted-foreground',
};

export default function EmployeeCardWithCertificates({
  employee,
  index,
  onEdit,
  onDelete,
  onViewAudit,
  isAdmin = false,
}: EmployeeCardWithCertificatesProps) {
  const [isTrainingsExpanded, setIsTrainingsExpanded] = useState(false);
  const [expandedTrainingId, setExpandedTrainingId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedTrainingForUpload, setSelectedTrainingForUpload] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [certificatesRefresh, setCertificatesRefresh] = useState(0);

  const worstStatus = getWorstStatus(employee);

  const handleUploadClick = (trainingId: string, trainingName: string) => {
    setSelectedTrainingForUpload({ id: trainingId, name: trainingName });
    setShowUploadModal(true);
  };

  const handleUploadSuccess = () => {
    setCertificatesRefresh(prev => prev + 1);
  };

  return (
    <>
      <div
        className={`bg-card rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border-l-4 ${statusBorderMap[worstStatus]} animate-fade-in-up group`}
        style={{ animationDelay: `${index * 60}ms` }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-navy to-navy-light p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-white/15 p-2 rounded-lg shrink-0">
                <User size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white truncate">{employee.name}</h3>
                <div className="flex items-center gap-2 text-white/70 text-sm truncate">
                  {employee.registration && (
                    <>
                      <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono border border-white/20">
                        #{employee.registration}
                      </span>
                      <span className="opacity-40">•</span>
                    </>
                  )}
                  <span>{employee.role}</span>
                </div>
                <div className="flex items-center gap-2 text-white/50 text-[10px] mt-0.5">
                  {employee.educationLevel && (
                    <>
                      <p className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-white/30" />
                        {employee.educationLevel}
                      </p>
                      <span className="opacity-40">•</span>
                    </>
                  )}
                  {employee.age && (
                    <p className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-white/30" />
                      {employee.age} anos
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {isAdmin && (
              <button
                onClick={() => onEdit(employee)}
                className="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-sm font-medium animate-in fade-in zoom-in duration-300"
              >
                <Edit2 size={14} />
                Editar
              </button>
            )}
            {onViewAudit && (
              <button
                onClick={() => onViewAudit(employee)}
                className="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-sm font-medium"
              >
                <History size={14} />
                Historico
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onDelete(employee.id)}
                className="bg-danger/80 hover:bg-danger text-white px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 text-sm font-medium animate-in fade-in zoom-in duration-300"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            )}
          </div>
        </div>

        {/* Trainings */}
        <div className="p-4">
          {employee.trainings && employee.trainings.length > 0 ? (
            <div>
              <button
                onClick={() => setIsTrainingsExpanded(!isTrainingsExpanded)}
                className="w-full flex items-center justify-between gap-2 mb-3 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-orange" />
                  <span className="font-semibold text-foreground text-sm">
                    Treinamentos ({employee.trainings.length})
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-muted-foreground transition-transform duration-300 ${
                    isTrainingsExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isTrainingsExpanded && (
                <div className="space-y-2.5">
                  {employee.trainings.map((training) => {
                    const statusInfo = getTrainingStatus(training.expirationDate);
                    const isExpanded = expandedTrainingId === training.id;

                    return (
                      <div key={training.id}>
                        <div
                          className={`rounded-lg p-3 border ${statusBgMap[statusInfo.status]} transition-all duration-200`}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusDotMap[statusInfo.status]}`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Shield size={13} className="shrink-0 opacity-60" />
                                <h4 className="font-semibold text-sm truncate">{training.name}</h4>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5 text-xs opacity-80">
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} />
                                  Realizado:{' '}
                                  {new Date(training.completionDate + 'T00:00:00').toLocaleDateString(
                                    'pt-BR'
                                  )}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} />
                                  Vencimento:{' '}
                                  {new Date(training.expirationDate + 'T00:00:00').toLocaleDateString(
                                    'pt-BR'
                                  )}
                                </span>
                              </div>
                              <p className="text-xs font-bold mt-1.5">{statusInfo.label}</p>

                              {/* Certificate Actions */}
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() =>
                                    handleUploadClick(training.id, training.name)
                                  }
                                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                >
                                  <Upload size={12} />
                                  Upload Certificado
                                </button>
                                <button
                                  onClick={() =>
                                    setExpandedTrainingId(
                                      isExpanded ? null : training.id
                                    )
                                  }
                                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                >
                                  <FileText size={12} />
                                  Ver Certificados
                                </button>
                              </div>

                              {/* Certificates List */}
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-current/10">
                                  <CertificatesList
                                    trainingId={training.id}
                                    employeeId={employee.id}
                                    onCertificatesChange={handleUploadSuccess}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-6">
              Nenhum treinamento cadastrado
            </p>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {selectedTrainingForUpload && (
        <CertificateUploadModal
          isOpen={showUploadModal}
          trainingId={selectedTrainingForUpload.id}
          employeeId={employee.id}
          trainingName={selectedTrainingForUpload.name}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedTrainingForUpload(null);
          }}
          onSuccess={handleUploadSuccess}
        />
      )}
    </>
  );
}
