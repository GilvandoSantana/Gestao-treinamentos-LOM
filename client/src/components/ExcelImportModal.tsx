import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { parseExcelFile, generateExcelTemplate } from '@/lib/excel-parser';
import type { Employee } from '@/lib/types';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (employees: Employee[]) => Promise<void>;
}

export default function ExcelImportModal({ isOpen, onClose, onImport }: ExcelImportModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Por favor, selecione um arquivo Excel (.xlsx ou .xls)');
      return;
    }

    setIsLoading(true);
    try {
      const employees = await parseExcelFile(file);

      if (employees.length === 0) {
        toast.error('Nenhum colaborador encontrado no arquivo');
        setIsLoading(false);
        return;
      }

      await onImport(employees);
      onClose();
    } catch (error) {
      toast.error(`Erro ao importar: ${error instanceof Error ? error.message : 'Desconhecido'}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadTemplate = () => {
    try {
      generateExcelTemplate();
      toast.success('Template baixado com sucesso!');
    } catch (error) {
      toast.error('Erro ao baixar template');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar do Excel</DialogTitle>
          <DialogDescription>
            Carregue um arquivo Excel com dados de colaboradores e treinamentos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Formato esperado:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Nome</strong> - obrigatório</li>
                  <li><strong>Matrícula, Função, Escolaridade, Data de Nascimento, Telefone</strong> - opcionais</li>
                  <li><strong>Treinamento, Data de Realização, Data de Vencimento</strong> - opcionais</li>
                </ul>
                <p className="text-xs mt-2">
                  Para vários treinamentos da mesma pessoa, repita o nome dela em várias linhas —
                  o modelo baixado abaixo já mostra um exemplo assim.
                </p>
              </div>
            </div>
          </div>

          {/* Template Download */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleDownloadTemplate}
            disabled={isLoading}
          >
            <Download className="w-4 h-4 mr-2" />
            Baixar Template
          </Button>

          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Upload Button */}
          <Button
            className="w-full bg-orange-600 hover:bg-orange-700"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isLoading ? 'Processando...' : 'Selecionar Arquivo'}
          </Button>

          {/* Cancel Button */}
          <Button
            variant="outline"
            className="w-full"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
