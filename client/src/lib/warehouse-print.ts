/**
 * Termo de recebimento — abre uma janela de impressão do navegador com um
 * documento formatado pra colher assinatura física em papel, igual ao
 * sistema original fazia ao entregar ferramenta ou dar saída de material.
 */

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit?: string;
}

export interface ReceiptData {
  title: string;
  employeeName: string;
  items: ReceiptItem[];
  areaUso?: string | null;
  obs?: string | null;
}

export function printReceipt(data: ReceiptData): void {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    alert('Não foi possível abrir a janela de impressão. Verifique se o navegador está bloqueando pop-ups.');
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const itemsRows = data.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td style="text-align:center">${item.quantity}${
          item.unit ? ' ' + escapeHtml(item.unit) : ''
        }</td></tr>`
    )
    .join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(data.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; }
        h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
        .subtitle { text-align: center; color: #666; font-size: 12px; margin-bottom: 24px; }
        .field { margin-bottom: 10px; font-size: 13px; }
        .field strong { display: inline-block; min-width: 110px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ccc; padding: 8px; font-size: 13px; text-align: left; }
        th { background: #f0f0f0; }
        .terms { font-size: 12px; color: #333; margin: 24px 0; line-height: 1.5; text-align: justify; }
        .signature { margin-top: 60px; text-align: center; }
        .signature-line { border-top: 1px solid #333; width: 320px; margin: 0 auto 6px; }
        .signature-name { font-size: 12px; }
        .footer { margin-top: 40px; font-size: 10px; color: #999; text-align: center; }
        .btn { margin: 20px auto; display: block; padding: 8px 20px; font-size: 14px; cursor: pointer; }
        @media print { .btn { display: none; } }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(data.title)}</h1>
      <p class="subtitle">Gestão de Treinamentos — Almoxarifado</p>

      <div class="field"><strong>Colaborador:</strong> ${escapeHtml(data.employeeName)}</div>
      <div class="field"><strong>Data/Hora:</strong> ${dateStr} às ${timeStr}</div>
      ${data.areaUso ? `<div class="field"><strong>Área de uso:</strong> ${escapeHtml(data.areaUso)}</div>` : ''}
      ${data.obs ? `<div class="field"><strong>Observação:</strong> ${escapeHtml(data.obs)}</div>` : ''}

      <table>
        <thead><tr><th>Item</th><th style="text-align:center">Quantidade</th></tr></thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <p class="terms">
        Declaro ter recebido o(s) item(ns) acima, em bom estado de conservação e funcionamento,
        assumindo a responsabilidade pela sua guarda e uso correto. Comprometo-me a devolvê-lo(s)
        (quando aplicável) em bom estado, e a comunicar imediatamente qualquer dano, extravio ou
        mau funcionamento.
      </p>

      <div class="signature">
        <div class="signature-line"></div>
        <p class="signature-name">${escapeHtml(data.employeeName)}</p>
      </div>

      <p class="footer">Documento gerado automaticamente em ${dateStr} ${timeStr}.</p>

      <button class="btn" onclick="window.print()">🖨️ Imprimir</button>
      <script>setTimeout(() => window.print(), 400);</script>
    </body>
    </html>
  `);
  win.document.close();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
