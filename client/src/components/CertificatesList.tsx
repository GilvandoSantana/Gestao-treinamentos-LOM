/**
 * CertificatesList Component
 * Displays list of uploaded certificates for a training
 */

import { useState } from 'react';
import { Download, Trash2, FileText, AlertCircle, Loader } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import type { Certificate } from '@/lib/types';

interface CertificatesListProps {
  trainingId: string;
  employeeId?: string;
  onCertificatesChange?: () => void;
}

export default function CertificatesList({
  trainingId,
  employeeId,
  onCertificatesChange,
}: CertificatesListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteMutation = trpc.certificates.delete.useMutation();

  // Fetch certificates
  const { data: certificates = [], isLoading, refetch } = trpc.certificates.getByTraining.useQuery(
    { trainingId },
    { enabled: !!trainingId }
  );

  const handleDelete = async (certificateId: string) => {
    if (!window.confirm('Are you sure you want to delete this certificate?')) {
      return;
    }

    setDeletingId(certificateId);
    try {
      await deleteMutation.mutateAsync({ id: certificateId });
      toast.success('Certificate deleted successfully');
      refetch();
      onCertificatesChange?.();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete certificate');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (certificate: Certificate) => {
    // Open certificate in new tab
    window.open(certificate.fileUrl, '_blank');
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className="py-8 text-center">
        <FileText size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">No certificates uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Uploaded Certificates</h3>

      {certificates.map((cert) => (
        <div
          key={cert.id}
          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FileText size={20} className="text-blue-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{cert.fileName}</p>
              <p className="text-xs text-gray-500 mt-1">
                {formatFileSize(cert.fileSize)} • Uploaded {formatDate(cert.uploadedAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button
              onClick={() => handleDownload(cert)}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Download certificate"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => handleDelete(cert.id)}
              disabled={deletingId === cert.id}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title="Delete certificate"
            >
              {deletingId === cert.id ? (
                <Loader size={18} className="animate-spin" />
              ) : (
                <Trash2 size={18} />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
