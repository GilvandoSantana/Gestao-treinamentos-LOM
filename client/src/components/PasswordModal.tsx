import { useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

interface PasswordModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

const CORRECT_PASSWORD = 'SCM2026lom@';

export default function PasswordModal({
  isOpen,
  title = 'Acesso Restrito',
  description = 'Digite a senha para continuar',
  onSuccess,
  onCancel,
}: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate a small delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('Password attempt:', password);
    console.log('Correct password:', CORRECT_PASSWORD);
    if (password === CORRECT_PASSWORD) {
      console.log('Password correct!');
      toast.success('Autenticação bem-sucedida!');
      setPassword('');
      onSuccess();
    } else {
      console.log('Password incorrect!');
      toast.error('Senha incorreta. Tente novamente.');
      setPassword('');
    }

    setIsLoading(false);
  };

  const handleCancel = () => {
    setPassword('');
    if (onCancel) {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-center mb-6">
          <div className="bg-orange-100 p-3 rounded-full">
            <Lock className="w-6 h-6 text-orange-600" />
          </div>
        </div>

        {/* Title and Description */}
        <h2 className="text-2xl font-bold text-center text-navy mb-2">{title}</h2>
        <p className="text-center text-gray-600 text-sm mb-6">{description}</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              autoFocus
              disabled={isLoading}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isLoading ? 'Verificando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
