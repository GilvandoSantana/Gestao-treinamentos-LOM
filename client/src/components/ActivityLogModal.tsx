/*
 * Design: Industrial Blueprint — Neo-Industrial
 * ActivityLogModal: rastro de quem fez o quê no site. Exclusivo do
 * administrador principal.
 */

import { useMemo, useState } from 'react';
import { X, Footprints, Loader, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ActivityLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Rótulo legível e cor por tipo de ação. */
const ACTION_INFO: Record<string, { label: string; className: string }> = {
  login: { label: 'Entrou no sistema', className: 'bg-muted text-muted-foreground' },
  'employee.create': { label: 'Cadastrou colaborador', className: 'bg-teal/10 text-teal' },
  'employee.update': { label: 'Editou colaborador', className: 'bg-navy/10 text-navy' },
  'employee.delete': { label: 'Excluiu colaborador', className: 'bg-danger/10 text-danger' },
  'employee.dismiss': { label: 'Marcou como demitido', className: 'bg-warning/15 text-warning' },
  'employee.restore': { label: 'Readmitiu colaborador', className: 'bg-teal/10 text-teal' },
  'employee.photo': { label: 'Alterou foto', className: 'bg-navy/10 text-navy' },
  'employee.import': { label: 'Importou/sincronizou dados', className: 'bg-navy/10 text-navy' },
  'training.delete': { label: 'Excluiu treinamento', className: 'bg-danger/10 text-danger' },
  'certificate.upload': { label: 'Anexou certificado', className: 'bg-teal/10 text-teal' },
  'certificate.delete': { label: 'Excluiu certificado', className: 'bg-danger/10 text-danger' },
  'account.create': { label: 'Criou conta de acesso', className: 'bg-orange/10 text-orange' },
  'account.delete': { label: 'Removeu conta de acesso', className: 'bg-danger/10 text-danger' },
  'account.permissions': { label: 'Alterou permissões', className: 'bg-orange/10 text-orange' },
  'account.impersonate': { label: 'Entrou como outro usuário', className: 'bg-orange/10 text-orange' },
  'account.stopImpersonate': { label: 'Voltou para a conta de administrador', className: 'bg-muted text-muted-foreground' },
  'email.test': { label: 'Testou envio de e-mail', className: 'bg-muted text-muted-foreground' },
};

function formatWhen(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ActivityLogModal({ isOpen, onClose }: ActivityLogModalProps) {
  const [userFilter, setUserFilter] = useState<string>('');

  const query = trpc.auth.activity.list.useQuery(
    { limit: 200 },
    { enabled: isOpen, refetchOnWindowFocus: false }
  );

  const logs = query.data ?? [];

  const usernames = useMemo(
    () => Array.from(new Set(logs.map((l) => l.username))).sort((a, b) => a.localeCompare(b)),
    [logs]
  );

  const visibleLogs = useMemo(
    () => (userFilter ? logs.filter((l) => l.username === userFilter) : logs),
    [logs, userFilter]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Footprints className="text-orange shrink-0" size={21} />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-foreground truncate">
                Rastros dos usuários
              </h2>
              <p className="text-xs text-muted-foreground">
                Últimas {logs.length} ações registradas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Atualizar"
            >
              <RefreshCw size={17} className={query.isFetching ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={23} />
            </button>
          </div>
        </div>

        {usernames.length > 1 && (
          <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setUserFilter('')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                userFilter === ''
                  ? 'bg-navy text-white border-navy'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              Todos
            </button>
            {usernames.map((name) => (
              <button
                key={name}
                onClick={() => setUserFilter(name)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  userFilter === name
                    ? 'bg-navy text-white border-navy'
                    : 'bg-card text-muted-foreground border-border'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2 justify-center py-10">
              <Loader size={15} className="animate-spin" /> Carregando...
            </p>
          ) : query.isError ? (
            <p className="text-sm text-danger text-center py-10">
              {query.error?.message || 'Não foi possível carregar o rastro.'}
            </p>
          ) : visibleLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhuma ação registrada ainda. O rastro começa a partir de agora — ações anteriores a
              esta atualização não foram gravadas.
            </p>
          ) : (
            <ol className="space-y-2">
              {visibleLogs.map((log) => {
                const info = ACTION_INFO[log.action] ?? {
                  label: log.action,
                  className: 'bg-muted text-muted-foreground',
                };
                return (
                  <li
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{log.username}</span>
                        {log.role === 'admin' && (
                          <span className="font-technical text-[9px] uppercase tracking-wide bg-orange/10 text-orange px-1.5 py-0.5 rounded">
                            admin
                          </span>
                        )}
                      </div>

                      <span
                        className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded ${info.className}`}
                      >
                        {info.label}
                      </span>

                      {(log.targetName || log.details) && (
                        <p className="text-xs text-muted-foreground mt-1 break-words">
                          {log.targetName}
                          {log.targetName && log.details ? ' — ' : ''}
                          {log.details}
                        </p>
                      )}
                    </div>

                    <span className="font-technical text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                      {formatWhen(log.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
