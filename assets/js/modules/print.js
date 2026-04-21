import { showToast } from './ui.js';

export function createPrintModule(ctx) {
  const { state } = ctx;

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

  function formatDateTime(value = null) {
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime())
      ? new Date().toLocaleString('pt-BR')
      : date.toLocaleString('pt-BR');
  }

  function truncateText(text, max = 28) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function buildItemsTableHtml(sale) {
    const items = Array.isArray(sale.items) ? sale.items : [];

    if (!items.length) {
      return `<div class="receipt-empty">Sem itens lançados.</div>`;
    }

    return `
      <table class="receipt-items-table">
        <thead>
          <tr>
            <th class="col-product">Produto</th>
            <th class="col-qtd">QTD</th>
            <th class="col-unit">VALOR</th>
            <th class="col-total">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td class="col-product" title="${escapeHtml(item.name || '')}">
                ${escapeHtml(truncateText(item.name || '-', 30))}
              </td>
              <td class="col-qtd">${Number(item.quantity || 0)}</td>
              <td class="col-unit">${escapeHtml(formatMoney(item.unitPrice || 0))}</td>
              <td class="col-total">${escapeHtml(formatMoney(item.total || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function buildReceiptHtml(sale) {
    const { thermalWidth, compactMode } = getPrintSettings();
    const widthPx = thermalWidth === '58mm' ? 360 : 520;
    const storeName = state.settings?.storeName || 'Minha Loja';
    const address = state.settings?.address || '';
    const phone = state.settings?.phone || state.settings?.storePhone || '';
    const warrantyText = state.settings?.warrantyText || '';
    const printedAt = formatDateTime();
    const saleDateTime = sale.createdAt ? formatDateTime(sale.createdAt) : printedAt;

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Cupom não fiscal</title>
          <style>
            :root {
              --text: #111;
              --muted: #555;
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
              font-family: Arial, Helvetica, sans-serif;
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
              line-height: 1.35;
            }

            .center {
              text-align: center;
            }

            .store-name {
              font-size: ${compactMode ? '16px' : '18px'};
              font-weight: 700;
              margin-bottom: 3px;
            }

            .store-meta {
              color: var(--muted);
              margin-bottom: 2px;
              word-break: break-word;
            }

            .receipt-title {
              font-size: ${compactMode ? '13px' : '14px'};
              font-weight: 700;
              margin-top: 6px;
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
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 8px;
            }

            .meta-line .label {
              font-weight: 700;
            }

            .meta-line .value {
              text-align: right;
              flex: 1;
              word-break: break-word;
            }

            .receipt-items-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              margin-top: 6px;
            }

            .receipt-items-table th,
            .receipt-items-table td {
              padding: 4px 2px;
              border-bottom: 1px dotted #999;
              vertical-align: top;
            }

            .receipt-items-table th {
              font-size: ${compactMode ? '10px' : '11px'};
              text-align: left;
              font-weight: 700;
            }

            .receipt-items-table td {
              font-size: ${compactMode ? '10px' : '11px'};
            }

            .col-product {
              width: 42%;
              text-align: left;
              word-break: break-word;
            }

            .col-qtd {
              width: 12%;
              text-align: center;
              white-space: nowrap;
            }

            .col-unit {
              width: 21%;
              text-align: right;
              white-space: nowrap;
            }

            .col-total {
              width: 25%;
              text-align: right;
              white-space: nowrap;
            }

            .receipt-empty {
              padding: 8px 0;
            }

            .totals {
              margin-top: 8px;
            }

            .totals .line {
              display: flex;
              justify-content: space-between;
              gap: 10px;
              margin: 3px 0;
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
                <span class="value">${escapeHtml(saleDateTime)}</span>
              </div>
              <div class="meta-line">
                <span class="label">Impresso em:</span>
                <span class="value">${escapeHtml(printedAt)}</span>
              </div>
              <div class="meta-line">
                <span class="label">Cliente:</span>
                <span class="value">${escapeHtml(sale.customerName || 'Balcão')}</span>
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