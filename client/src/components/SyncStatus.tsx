import { Clock, CheckCircle2, AlertCircle, Loader } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SyncStatusProps {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  syncError?: string | null;
}

export default function SyncStatus({ lastSyncTime, isSyncing, syncError }: SyncStatusProps) {
  const [displayTime, setDisplayTime] = useState<string>('');

  useEffect(() => {
    if (!lastSyncTime) {
      setDisplayTime('Nunca sincronizado');
      return;
    }

    const updateTime = () => {
      const now = new Date();
      const diffMs = now.getTime() - lastSyncTime.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      let timeStr = '';
      if (diffSecs < 60) {
        timeStr = 'Agora';
      } else if (diffMins < 60) {
        timeStr = `${diffMins}m atrás`;
      } else if (diffHours < 24) {
        timeStr = `${diffHours}h atrás`;
      } else {
        timeStr = `${diffDays}d atrás`;
      }

      setDisplayTime(`${timeStr} • ${lastSyncTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg">
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        {isSyncing ? (
          <>
            <Loader className="w-4 h-4 text-orange animate-spin" />
            <span className="text-xs font-medium text-orange">Salvando alterações...</span>
          </>
        ) : syncError ? (
          <>
            <AlertCircle className="w-4 h-4 text-orange" />
            <span className="text-xs font-medium text-orange">Alterações locais</span>
          </>
        ) : lastSyncTime ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-teal" />
            <span className="text-xs font-medium text-teal">Banco de dados atualizado</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Sistema pronto</span>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Last Sync Time */}
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{displayTime}</span>
      </div>
    </div>
  );
}
