/**
 * Envio real de e-mail via Resend (API por HTTPS).
 *
 * Trocado de SMTP (nodemailer) para cá porque o Railway bloqueia conexões
 * SMTP diretas (portas 587 e 465 davam "Connection timeout" mesmo com tudo
 * configurado certo) — comum em plataformas desse tipo, para evitar que virem
 * fonte de spam. A API do Resend funciona por HTTPS normal, a mesma porta que
 * já funciona sem problema.
 *
 * Variáveis de ambiente necessárias:
 * - RESEND_API_KEY (criada em resend.com, gratuito até 3 mil e-mails/mês)
 * - ALERT_RECIPIENT_EMAIL (para quem os alertas de treinamento vão; aceita
 *   múltiplos endereços separados por vírgula)
 *
 * Opcional:
 * - RESEND_FROM_EMAIL — remetente, se você verificou um domínio próprio no
 *   Resend (ex: alertas@suaempresa.com). Sem isso, usa o remetente de teste
 *   onboarding@resend.dev, que só entrega para o e-mail da conta cadastrada
 *   no Resend — funciona para validar a configuração, mas para enviar a
 *   qualquer destinatário é preciso verificar um domínio.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "onboarding@resend.dev";

async function callResend(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "RESEND_API_KEY não configurado no Railway." };
  }

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const fromHeader = process.env.RESEND_FROM_EMAIL
    ? `Gestão de Controle dos Contratos <${from}>`
    : from;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader,
        to: params.to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let detail = body;
      try {
        const parsed = JSON.parse(body);
        detail = parsed.message || body;
      } catch {
        // corpo não era JSON, usa o texto bruto mesmo
      }
      return { ok: false, message: `Resend recusou (HTTP ${response.status}): ${detail}` };
    }

    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Falha de rede ao chamar o Resend: ${detail}` };
  }
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

  const result = await callResend({ to: recipients, subject: params.subject, html: params.html });
  if (!result.ok) {
    console.error("[Mailer] Erro ao enviar e-mail:", result.message);
    return false;
  }
  return true;
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
    ["RESEND_API_KEY", process.env.RESEND_API_KEY],
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

  const result = await callResend({
    to: recipients,
    subject: "Teste de envio — Gestão de Controle dos Contratos",
    html: `
      <p>Este é um e-mail de teste do sistema de Gestão de Controle dos Contratos.</p>
      <p>Se você recebeu esta mensagem, o envio automático de alertas de
      treinamentos vencendo está configurado corretamente.</p>
      <p style="color:#777;font-size:12px">Enviado em ${new Date().toLocaleString("pt-BR")}</p>
    `,
  });

  if (!result.ok) {
    console.error("[Mailer] Teste de envio falhou:", result.message);

    // Sem domínio verificado, o Resend só entrega para o e-mail da conta —
    // essa mensagem específica costuma indicar exatamente isso.
    const looksLikeUnverifiedDomain = /verify|domain|not allowed|testing emails/i.test(
      result.message
    );
    const hint = looksLikeUnverifiedDomain
      ? " Isso costuma acontecer quando o domínio não foi verificado no Resend: sem verificar, só é possível enviar para o e-mail da própria conta cadastrada lá. Verifique um domínio em resend.com/domains para enviar a qualquer destinatário."
      : "";

    return { success: false, message: `${result.message}${hint}` };
  }

  return { success: true, message: `E-mail de teste enviado para ${recipients}.` };
}
