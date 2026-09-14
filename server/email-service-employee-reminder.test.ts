import { describe, it, expect } from 'vitest';
import { buildEmployeeReminderMessage } from './email-service';

describe('buildEmployeeReminderMessage', () => {
  it('monta a mensagem com um treinamento vencido, usando o emoji e o texto certos', () => {
    const message = buildEmployeeReminderMessage('João Silva', [
      {
        employeeName: 'João Silva',
        trainingName: 'NR-35',
        daysRemaining: -5,
        expirationDate: '01/09/2026',
        status: 'expired',
        trainingId: 't1',
        employeeId: 'e1',
        contract: 'lom',
        employeePhone: '11999999999',
      },
    ]);

    expect(message).toContain('Olá, João Silva!');
    expect(message).toContain('⚠️ NR-35 — venceu em 01/09/2026');
  });

  it('monta a mensagem com um treinamento a vencer, usando o emoji e o texto certos', () => {
    const message = buildEmployeeReminderMessage('Maria Souza', [
      {
        employeeName: 'Maria Souza',
        trainingName: 'NR-33',
        daysRemaining: 12,
        expirationDate: '20/09/2026',
        status: 'expiring_soon',
        trainingId: 't2',
        employeeId: 'e2',
        contract: 'lom',
        employeePhone: '11988888888',
      },
    ]);

    expect(message).toContain('⏰ NR-33 — vence em 20/09/2026');
  });

  it('lista TODOS os treinamentos do colaborador na mesma mensagem, não só o primeiro', () => {
    const message = buildEmployeeReminderMessage('Carlos', [
      {
        employeeName: 'Carlos',
        trainingName: 'NR-35',
        daysRemaining: -1,
        expirationDate: '10/09/2026',
        status: 'expired',
        trainingId: 't1',
        employeeId: 'e1',
        contract: 'lom',
        employeePhone: '11977777777',
      },
      {
        employeeName: 'Carlos',
        trainingName: 'NR-33',
        daysRemaining: 5,
        expirationDate: '17/09/2026',
        status: 'expiring_soon',
        trainingId: 't3',
        employeeId: 'e1',
        contract: 'lom',
        employeePhone: '11977777777',
      },
    ]);

    expect(message).toContain('NR-35');
    expect(message).toContain('NR-33');
  });
});
