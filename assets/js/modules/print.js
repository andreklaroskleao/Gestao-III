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

  function normalizeCustomerName(value) {
    const name = String(value || '').trim();
    return name || UNIDENTIFIED_CUSTOMER;
  }

  function normalizeCustomerCpf(value) {
    const cpf = String(value || '').trim();
    return cpf || 'Não informado';
  }

  function truncateText(text, max = 34) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function buildItemsTableHtml(sale, options = {}) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const compactMode = Boolean(options.compactMode);
    const nameLimit = compactMode ? 22 : 30;

    if (!items.length) {
      return `
        <div class="empty-items">Sem itens lançados.</div>
      `;
    }

    return `
      <table class="items-table">
        <thead>
          <tr>
            <th class="col-product">Produto</th>
            <th class="col-qty">Qtd</th>
            <th class="col-price">Unit.</th>
            <th class="col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td class="col-product">
                <div class="product-name">${escapeHtml(truncateText(item.name || '-', nameLimit))}</div>
              </td>
              <td class="col-qty">${Number(item.quantity || 0)}</td>
              <td class="col-price">${escapeHtml(formatMoney(item.unitPrice || 0))}</td>
              <td class="col-total">${escapeHtml(formatMoney(item.total || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function buildReceiptHtml(sale = {}) {
    const { thermalWidth, compactMode } = getPrintSettings();
    const is58mm = thermalWidth === '58mm';

    const widthPx = is58mm ? 210 : 290;
    const horizontalPadding = is58mm ? 8 : 10;
    const baseFontSize = compactMode ? (is58mm ? 10 : 11) : (is58mm ? 11 : 12);
    const titleFontSize = is58mm ? 15 : 17;
    const storeFontSize = is58mm ? 14 : 16;
    const productMaxLines = is58mm ? 2 : 2;

    const storeName = state.settings?.storeName || 'Gestão III';
    const address = state.settings?.address || '';
    const phone = state.settings?.phone || state.settings?.storePhone || '';
    const warrantyText = state.settings?.warrantyText || '';

    const saleDateTime =
      String(sale.saleDateTimeLabel || '').trim() ||
      formatAnyDateTime(sale.createdAt) ||
      '-';

    const customerName = normalizeCustomerName(sale.customerName);
    const customerCpf = normalizeCustomerCpf(sale.customerCpf);

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Cupom não fiscal</title>
          <style>
            :root {
              --text: #111111;
              --muted: #4b4b4b;
              --line: #111111;
              --bg: #ffffff;
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: var(--bg);
              color: var(--text);
              font-family: "Courier New", Courier, monospace;
            }

            body {
              display: flex;
              justify-content: center;
              align-items: flex-start;
              padding: 6px;
              width: 100%;
            }

            .receipt {
              width: 100%;
              max-width: ${widthPx}px;
              padding: ${horizontalPadding}px;
              font-size: ${baseFontSize}px;
              line-height: 1.35;
              color: var(--text);
            }

            .center {
              text-align: center;
            }

            .store-name {
              font-size: ${storeFontSize}px;
              font-weight: 700;
              letter-spacing: 0.2px;
              text-transform: uppercase;
            }

            .store-meta {
              margin-top: 2px;
              color: var(--muted);
              word-break: break-word;
            }

            .receipt-title {
              margin-top: 8px;
              font-size: ${titleFontSize}px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }

            .section-line {
              border-top: 1px solid var(--line);
              margin: 8px 0;
            }

            .section-line.dashed {
              border-top-style: dashed;
            }

            .info-table,
            .totals-table {
              width: 100%;
              border-collapse: collapse;
            }

            .info-table td,
            .totals-table td {
              padding: 2px 0;
              vertical-align: top;
            }

            .info-table td.label {
              width: 78px;
              font-weight: 700;
              white-space: nowrap;
              padding-right: 6px;
            }

            .info-table td.value {
              word-break: break-word;
            }

            .items-title {
              font-weight: 700;
              text-transform: uppercase;
              margin-bottom: 4px;
            }

            .items-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              border-top: 1px solid var(--line);
              border-bottom: 1px solid var(--line);
            }

            .items-table thead th {
              font-weight: 700;
              text-transform: uppercase;
              border-bottom: 1px solid var(--line);
              padding: 4px 0 4px 0;
            }

            .items-table tbody td {
              padding: 4px 0;
              border-bottom: 1px dotted #777;
            }

            .items-table tbody tr:last-child td {
              border-bottom: none;
            }

            .items-table .col-product {
              width: ${is58mm ? '42%' : '44%'};
              text-align: left;
              padding-right: 4px;
            }

            .items-table .col-qty {
              width: ${is58mm ? '10%' : '10%'};
              text-align: right;
              white-space: nowrap;
              padding-right: 4px;
            }

            .items-table .col-price {
              width: ${is58mm ? '22%' : '22%'};
              text-align: right;
              white-space: nowrap;
              padding-right: 4px;
            }

            .items-table .col-total {
              width: ${is58mm ? '26%' : '24%'};
              text-align: right;
              white-space: nowrap;
            }

            .product-name {
              display: -webkit-box;
              -webkit-line-clamp: ${productMaxLines};
              -webkit-box-orient: vertical;
              overflow: hidden;
              word-break: break-word;
            }

            .empty-items {
              text-align: center;
              color: var(--muted);
              padding: 8px 0;
            }

            .totals-table td.label {
              font-weight: 700;
              padding-right: 8px;
            }

            .totals-table td.value {
              text-align: right;
              white-space: nowrap;
            }

            .totals-table tr.total td {
              font-size: ${is58mm ? 12 : 13}px;
              font-weight: 700;
              border-top: 1px solid var(--line);
              border-bottom: 1px solid var(--line);
              padding-top: 5px;
              padding-bottom: 5px;
            }

            .notes-block,
            .footer-block {
              white-space: pre-wrap;
              word-break: break-word;
            }

            .notes-title,
            .footer-title {
              font-weight: 700;
              margin-bottom: 3px;
            }

            .footer-message {
              text-align: center;
              margin-top: 6px;
              font-weight: 700;
            }

            .muted {
              color: var(--muted);
            }

            @page {
              margin: 0;
              size: auto;
            }

            @media print {
              html, body {
                width: auto;
                margin: 0;
                padding: 0;
                background: #fff;
              }

              body {
                display: block;
              }

              .receipt {
                max-width: none;
                width: 100%;
                padding: ${horizontalPadding}px;
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

            <div class="section-line"></div>

            <table class="info-table">
              <tr>
                <td class="label">Data/Hora:</td>
                <td class="value">${escapeHtml(saleDateTime)}</td>
              </tr>
              <tr>
                <td class="label">Cliente:</td>
                <td class="value">${escapeHtml(customerName)}</td>
              </tr>
              <tr>
                <td class="label">CPF:</td>
                <td class="value">${escapeHtml(customerCpf)}</td>
              </tr>
              <tr>
                <td class="label">Pagamento:</td>
                <td class="value">${escapeHtml(sale.paymentMethod || '-')}</td>
              </tr>
            </table>

            <div class="section-line dashed"></div>

            <div class="items-title">Itens</div>
            ${buildItemsTableHtml(sale, { compactMode })}

            <div class="section-line dashed"></div>

            <table class="totals-table">
              <tr>
                <td class="label">Subtotal</td>
                <td class="value">${escapeHtml(formatMoney(sale.subtotal || 0))}</td>
              </tr>
              <tr>
                <td class="label">Desconto</td>
                <td class="value">${escapeHtml(formatMoney(sale.discount || 0))}</td>
              </tr>
              <tr class="total">
                <td class="label">TOTAL</td>
                <td class="value">${escapeHtml(formatMoney(sale.total || 0))}</td>
              </tr>
              <tr>
                <td class="label">Valor pago</td>
                <td class="value">${escapeHtml(formatMoney(sale.amountPaid || 0))}</td>
              </tr>
              <tr>
                <td class="label">Troco</td>
                <td class="value">${escapeHtml(formatMoney(sale.change || 0))}</td>
              </tr>
            </table>

            ${sale.notes ? `
              <div class="section-line dashed"></div>
              <div class="notes-block">
                <div class="notes-title">Observações</div>
                <div>${escapeHtml(sale.notes)}</div>
              </div>
            ` : ''}

            ${warrantyText ? `
              <div class="section-line dashed"></div>
              <div class="footer-block muted">
                <div class="footer-title">Informações</div>
                <div>${escapeHtml(warrantyText)}</div>
              </div>
            ` : ''}

            <div class="section-line"></div>
            <div class="footer-message">Obrigado pela preferência</div>
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