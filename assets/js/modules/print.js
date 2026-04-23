import { showToast } from './ui.js';

export function createPrintModule(ctx) {
  const { state } = ctx;
  const UNIDENTIFIED_CUSTOMER = 'Cliente não identificado';

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function getPrintSettings() {
    return {
      thermalWidth: state.settings?.thermalWidth || '80mm',
      compactMode: Boolean(state.settings?.thermalCompactMode),
      autoPrint: Boolean(state.settings?.thermalAutoPrint)
    };
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function formatAnyDateTime(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
      return value;
    }

    if (value instanceof Date) {
      if (!Number.isNaN(value.getTime())) return value.toLocaleString('pt-BR');
      return '';
    }

    if (value?.toDate && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
      return '';
    }

    if (typeof value === 'object' && value.seconds != null) {
      const parsed = new Date(Number(value.seconds) * 1000);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('pt-BR');
    return '';
  }

  function truncateText(text, max = 30) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function buildItemsTableHtml(sale) {
    const items = Array.isArray(sale.items) ? sale.items : [];

    if (!items.length) {
      return `
        <div class="empty-items">Sem itens lançados.</div>
      `;
    }

    return `
      <table class="items-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>QTD</th>
            <th>VALOR</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(truncateText(item.name || '-', 30))}</td>
              <td>${Number(item.quantity || 0)}</td>
              <td>${escapeHtml(formatMoney(item.unitPrice || 0))}</td>
              <td>${escapeHtml(formatMoney(item.total || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function buildReceiptHtml(sale = {}) {
    const settings = getPrintSettings();
    const compactMode = Boolean(settings.compactMode);
    const widthPx = settings.thermalWidth === '58mm' ? 220 : 300;

    const storeName = state.settings?.storeName || 'Gestão III';
    const address = state.settings?.address || '';
    const phone = state.settings?.phone || state.settings?.storePhone || '';
    const warrantyText = state.settings?.warrantyText || '';

    const saleDateTime =
      String(sale.saleDateTimeLabel || '').trim() ||
      formatAnyDateTime(sale.createdAt) ||
      '';

    const customerName = String(sale.customerName || '').trim() || UNIDENTIFIED_CUSTOMER;
    const customerCpf = String(sale.customerCpf || '').trim() || 'Não informado';

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Cupom não fiscal</title>
          <style>
            :root {
              --text: #111;
              --muted: #444;
              --line: #000;
            }

            * {
              box-sizing: border-box;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: var(--text);
              font-family: "Courier New", Courier, monospace;
            }

            body {
              width: 100%;
              display: flex;
              justify-content: center;
              padding: 8px;
            }

            .receipt {
              width: 100%;
              max-width: ${widthPx}px;
              padding: ${compactMode ? '8px' : '12px'};
              font-size: ${compactMode ? '11px' : '12px'};
              line-height: 1.4;
            }

            .center {
              text-align: center;
            }

            .store-name {
              font-weight: 700;
              font-size: ${compactMode ? '14px' : '16px'};
            }

            .store-meta {
              margin-top: 2px;
              color: var(--muted);
            }

            .receipt-title {
              margin-top: 8px;
              font-weight: 700;
              text-transform: uppercase;
            }

            .divider {
              border-top: 1px dashed var(--line);
              margin: 8px 0;
            }

            .meta-grid {
              display: grid;
              gap: 4px;
            }

            .meta-line {
              display: grid;
              grid-template-columns: 84px 1fr;
              gap: 8px;
              align-items: start;
            }

            .meta-line .label {
              font-weight: 700;
            }

            .meta-line .value {
              word-break: break-word;
            }

            .items-table {
              width: 100%;
              border-collapse: collapse;
            }

            .items-table th,
            .items-table td {
              text-align: left;
              padding: 3px 0;
              vertical-align: top;
            }

            .items-table th:nth-child(2),
            .items-table th:nth-child(3),
            .items-table th:nth-child(4),
            .items-table td:nth-child(2),
            .items-table td:nth-child(3),
            .items-table td:nth-child(4) {
              text-align: right;
              white-space: nowrap;
            }

            .empty-items {
              text-align: center;
              color: var(--muted);
              padding: 8px 0;
            }

            .totals {
              margin-top: 8px;
            }

            .totals .line {
              display: grid;
              grid-template-columns: 1fr auto;
              gap: 10px;
              margin: 3px 0;
              align-items: center;
            }

            .totals .line.total {
              font-weight: 700;
              font-size: ${compactMode ? '12px' : '13px'};
            }

            .footer {
              margin-top: 8px;
              color: var(--muted);
              white-space: pre-wrap;
              word-break: break-word;
              text-align: center;
            }

            @media print {
              body {
                padding: 0;
              }

              .receipt {
                max-width: 100%;
                width: 100%;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <div class="store-name">${escapeHtml(storeName)}</div>
              ${address ? `<div class="store-meta">${escapeHtml(address)}</div>` : ''}
              ${phone ? `<div class="store-meta">Telefone: ${escapeHtml(phone)}</div>` : ''}
              <div class="receipt-title">Cupom não fiscal</div>
            </div>

            <div class="divider"></div>

            <div class="meta-grid">
              <div class="meta-line">
                <span class="label">Data/Hora:</span>
                <span class="value">${escapeHtml(saleDateTime || '-')}</span>
              </div>

              <div class="meta-line">
                <span class="label">Cliente:</span>
                <span class="value">${escapeHtml(customerName)}</span>
              </div>

              <div class="meta-line">
                <span class="label">CPF:</span>
                <span class="value">${escapeHtml(customerCpf)}</span>
              </div>

              <div class="meta-line">
                <span class="label">Pagamento:</span>
                <span class="value">${escapeHtml(sale.paymentMethod || '-')}</span>
              </div>
            </div>

            <div class="divider"></div>

            ${buildItemsTableHtml(sale)}

            <div class="divider"></div>

            <div class="totals">
              <div class="line">
                <span>Subtotal</span>
                <strong>${escapeHtml(formatMoney(sale.subtotal || 0))}</strong>
              </div>

              <div class="line">
                <span>Desconto</span>
                <strong>${escapeHtml(formatMoney(sale.discount || 0))}</strong>
              </div>

              <div class="line total">
                <span>Total</span>
                <strong>${escapeHtml(formatMoney(sale.total || 0))}</strong>
              </div>

              <div class="line">
                <span>Valor pago</span>
                <strong>${escapeHtml(formatMoney(sale.amountPaid || 0))}</strong>
              </div>

              <div class="line">
                <span>Troco</span>
                <strong>${escapeHtml(formatMoney(sale.change || 0))}</strong>
              </div>
            </div>

            ${sale.notes ? `
              <div class="divider"></div>
              <div><strong>Observações:</strong></div>
              <div>${escapeHtml(sale.notes)}</div>
            ` : ''}

            ${warrantyText ? `
              <div class="divider"></div>
              <div class="footer">${escapeHtml(warrantyText)}</div>
            ` : ''}

            <div class="divider"></div>
            <div class="footer">Obrigado pela preferência</div>
          </div>
        </body>
      </html>
    `;
  }

  function printSaleReceipt(sale) {
    const html = buildReceiptHtml(sale);
    const win = window.open('', '_blank', 'width=520,height=900');

    if (!win) {
      showToast('Não foi possível abrir a janela de impressão.', 'error');
      return;
    }

    win.document.write(html);
    win.document.close();
    win.focus();

    if (getPrintSettings().autoPrint) {
      setTimeout(() => {
        try {
          win.print();
        } catch (error) {
          console.error(error);
        }
      }, 250);
    }
  }

  return {
    buildReceiptHtml,
    printSaleReceipt,
    getPrintSettings
  };
}