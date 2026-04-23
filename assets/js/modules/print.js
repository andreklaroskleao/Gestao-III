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

  function buildItemsHtml(sale, options = {}) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const is58mm = Boolean(options.is58mm);

    if (!items.length) {
      return `<div class="empty-items">Sem itens lançados.</div>`;
    }

    return `
      <div class="items-block">
        <div class="items-header-row">
          <div class="col-product">PRODUTO</div>
          <div class="col-qty">QTD</div>
          <div class="col-unit">UNIT.</div>
          <div class="col-total">TOTAL</div>
        </div>

        ${items.map((item) => `
          <div class="item-row">
            <div class="col-product product-name">${escapeHtml(item.name || '-')}</div>
            <div class="col-qty">${Number(item.quantity || 0)}</div>
            <div class="col-unit">${escapeHtml(formatMoney(item.unitPrice || 0))}</div>
            <div class="col-total">${escapeHtml(formatMoney(item.total || 0))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function buildReceiptHtml(sale = {}) {
    const { thermalWidth, compactMode } = getPrintSettings();
    const is58mm = thermalWidth === '58mm';

    const widthPx = is58mm ? 230 : 320;
    const paddingX = is58mm ? 10 : 12;
    const baseFontSize = compactMode ? (is58mm ? 10 : 11) : (is58mm ? 11 : 12);
    const storeNameSize = is58mm ? 15 : 17;
    const titleSize = is58mm ? 16 : 18;
    const dashLine = '------------------------------------------------------------';

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
              --text: #111;
              --muted: #555;
              --bg: #fff;
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
              font-variant-numeric: tabular-nums;
              font-feature-settings: "tnum" 1;
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
              padding: ${paddingX}px;
              font-size: ${baseFontSize}px;
              line-height: 1.35;
            }

            .center {
              text-align: center;
            }

            .store-name {
              font-size: ${storeNameSize}px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }

            .store-meta {
              margin-top: 2px;
              word-break: break-word;
            }

            .receipt-title {
              margin-top: 10px;
              font-size: ${titleSize}px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }

            .ascii-line {
              text-align: center;
              white-space: nowrap;
              overflow: hidden;
              margin: 8px 0;
              letter-spacing: 0;
            }

            .info-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            .info-table td {
              padding: 2px 0;
              vertical-align: top;
            }

            .info-table td.label {
              width: 36%;
              font-weight: 700;
              white-space: nowrap;
            }

            .info-table td.separator {
              width: 4%;
              text-align: center;
              font-weight: 700;
            }

            .info-table td.value {
              width: 60%;
              word-break: break-word;
            }

            .section-title-center {
              text-align: center;
              font-weight: 700;
              text-transform: uppercase;
              margin: 2px 0 6px;
            }

            .items-block {
              width: 100%;
              border-top: 1px solid #111;
              border-bottom: 1px solid #111;
            }

            .items-header-row,
            .item-row {
              display: grid;
              grid-template-columns: ${is58mm ? '1.8fr 0.5fr 1fr 1fr' : '2.2fr 0.6fr 1fr 1fr'};
              column-gap: 8px;
              align-items: start;
            }

            .items-header-row {
              font-weight: 700;
              text-transform: uppercase;
              padding: 6px 0 5px;
              border-bottom: 1px solid #111;
            }

            .item-row {
              padding: 6px 0;
              border-bottom: 1px dotted #777;
            }

            .item-row:last-child {
              border-bottom: none;
            }

            .col-product {
              text-align: left;
              min-width: 0;
              word-break: break-word;
              overflow-wrap: anywhere;
            }

            .col-qty,
            .col-unit,
            .col-total {
              text-align: right;
              white-space: nowrap;
            }

            .product-name {
              line-height: 1.2;
            }

            .empty-items {
              text-align: center;
              color: var(--muted);
              padding: 8px 0;
            }

            .totals-table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            .totals-table td {
              padding: 3px 0;
              vertical-align: top;
            }

            .totals-table td.label {
              width: 65%;
              font-weight: 700;
            }

            .totals-table td.value {
              width: 35%;
              text-align: right;
              white-space: nowrap;
            }

            .totals-table tr.total-row td {
              font-size: ${is58mm ? 13 : 14}px;
              font-weight: 700;
              border-top: 1px solid #111;
              border-bottom: 1px solid #111;
              padding-top: 5px;
              padding-bottom: 5px;
            }

            .info-block {
              text-align: center;
            }

            .info-title {
              font-weight: 700;
              text-transform: uppercase;
              margin-bottom: 6px;
            }

            .info-text {
              white-space: pre-wrap;
              word-break: break-word;
              color: var(--text);
            }

            .thanks {
              text-align: center;
              font-weight: 700;
              margin-top: 6px;
            }

            @page {
              margin: 0;
              size: auto;
            }

            @media print {
              html, body {
                margin: 0;
                padding: 0;
                width: auto;
                background: #fff;
              }

              body {
                display: block;
              }

              .receipt {
                width: 100%;
                max-width: none;
                padding: ${paddingX}px;
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
              <div class="receipt-title">CUPOM NÃO FISCAL</div>
            </div>

            <div class="ascii-line">${dashLine}</div>

            <table class="info-table">
              <tr>
                <td class="label">Data/Hora</td>
                <td class="separator">:</td>
                <td class="value">${escapeHtml(saleDateTime)}</td>
              </tr>
              <tr>
                <td class="label">Cliente</td>
                <td class="separator">:</td>
                <td class="value">${escapeHtml(customerName)}</td>
              </tr>
              <tr>
                <td class="label">CPF</td>
                <td class="separator">:</td>
                <td class="value">${escapeHtml(customerCpf)}</td>
              </tr>
              <tr>
                <td class="label">Pagamento</td>
                <td class="separator">:</td>
                <td class="value">${escapeHtml(sale.paymentMethod || '-')}</td>
              </tr>
            </table>

            <div class="ascii-line">${dashLine}</div>

            <div class="section-title-center">ITENS</div>

            ${buildItemsHtml(sale, { is58mm })}

            <div class="ascii-line">${dashLine}</div>

            <table class="totals-table">
              <tr>
                <td class="label">Subtotal</td>
                <td class="value">${escapeHtml(formatMoney(sale.subtotal || 0))}</td>
              </tr>
              <tr>
                <td class="label">Desconto</td>
                <td class="value">${escapeHtml(formatMoney(sale.discount || 0))}</td>
              </tr>
              <tr class="total-row">
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

            ${warrantyText ? `
              <div class="ascii-line">${dashLine}</div>
              <div class="info-block">
                <div class="info-title">INFORMAÇÕES</div>
                <div class="info-text">${escapeHtml(warrantyText)}</div>
              </div>
            ` : ''}

            ${sale.notes ? `
              <div class="ascii-line">${dashLine}</div>
              <div class="info-block">
                <div class="info-title">OBSERVAÇÕES</div>
                <div class="info-text">${escapeHtml(sale.notes)}</div>
              </div>
            ` : ''}

            <div class="ascii-line">${dashLine}</div>
            <div class="thanks">Obrigado pela preferência!</div>
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