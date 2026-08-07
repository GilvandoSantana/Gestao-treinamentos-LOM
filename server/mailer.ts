import nodemailer from "nodemailer";

/**
 * Envio real de e-mail via SMTP. Pensado para Gmail com senha de app, mas
 * funciona com qualquer provedor SMTP padrão — só trocar as variáveis de
 * ambiente.
 *
 * Variáveis de ambiente necessárias:
 * - SMTP_HOST (ex: smtp.gmail.com)
 * - SMTP_PORT (ex: 587)
 * - SMTP_USER (o endereço Gmail que envia)
 * - SMTP_PASSWORD (a senha de app do Gmail, NÃO a senha normal da conta)
 * - ALERT_RECIPIENT_EMAIL (para quem os alertas de treinamento vão; aceita
 *   múltiplos endereços separados por vírgula)
 */

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "Configuração de e-mail incompleta. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASSWORD no Railway."
    );
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465, // 465 = SSL direto; 587 = STARTTLS
    auth: { user, pass },
    // O padrão do nodemailer já é generoso (2 min), mas deixamos explícito
    // para não haver dúvida: se isso estourar, é rede mesmo, não timeout curto.
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
  });

  return cachedTransporter;
}

export async function sendEmail(params: {
  subject: string;
  html: string;
  /** Destinatário específico (ex: e-mail do contrato); sem isso usa o global. */
  to?: string;
}): Promise<boolean> {
  const recipients = params.to || process.env.ALERT_RECIPIENT_EMAIL;
  if (!recipients) {
    console.error(
      "[Mailer] Nenhum destinatário: nem e-mail do contrato, nem ALERT_RECIPIENT_EMAIL configurado."
    );
    return false;
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Gestão de Controle dos Contratos" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (error) {
    console.error("[Mailer] Erro ao enviar e-mail:", error);
    return false;
  }
}

/**
 * Envia um e-mail de teste e devolve o motivo exato de eventual falha.
 *
 * Diferente de sendEmail(), que apenas registra o erro no log e segue, aqui a
 * mensagem volta para a tela — o objetivo é justamente diagnosticar a
 * configuração sem precisar abrir os logs do Railway.
 */
export async function sendTestEmail(): Promise<{ success: boolean; message: string }> {
  const missing = [
    ["SMTP_HOST", process.env.SMTP_HOST],
    ["SMTP_PORT", process.env.SMTP_PORT],
    ["SMTP_USER", process.env.SMTP_USER],
    ["SMTP_PASSWORD", process.env.SMTP_PASSWORD],
    ["ALERT_RECIPIENT_EMAIL", process.env.ALERT_RECIPIENT_EMAIL],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    return {
      success: false,
      message: `Falta configurar no Railway: ${missing.join(", ")}.`,
    };
  }

  const recipients = process.env.ALERT_RECIPIENT_EMAIL as string;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Gestão de Controle dos Contratos" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject: "Teste de envio — Gestão de Controle dos Contratos",
      html: `
        <p>Este é um e-mail de teste do sistema de Gestão de Controle dos Contratos.</p>
        <p>Se você recebeu esta mensagem, o envio automático de alertas de
        treinamentos vencendo está configurado corretamente.</p>
        <p style="color:#777;font-size:12px">Enviado em ${new Date().toLocaleString("pt-BR")}</p>
      `,
    });

    return { success: true, message: `E-mail de teste enviado para ${recipients}.` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[Mailer] Teste de envio falhou:", error);

    // "Connection timeout"/ECONNECTIMEOUT indica que a conexão TCP nunca
    // completou — quase sempre porta errada ou rede bloqueando aquela porta,
    // não um problema de usuário/senha. Sugere a alternativa mais comum.
    const isTimeout = /timeout|ETIMEDOUT|ECONNREFUSED/i.test(detail);
    const attempted = `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`;
    const hint = isTimeout
      ? ` A conexão com ${attempted} não completou. Confira se o host e a porta estão exatos (sem espaço extra). Se a porta configurada é 587, tente 465; se é 465, tente 587 — dependendo da rede, uma das duas costuma funcionar quando a outra trava.`
      : "";

    return { success: false, message: `Falha ao enviar (tentando ${attempted}): ${detail}.${hint}` };
  }
}
