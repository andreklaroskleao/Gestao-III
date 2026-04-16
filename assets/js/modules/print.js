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

  function getThermalCss() {
    const { thermalWidth, compactMode } = getPrintSettings();
    const paperWidth = thermalWidth === '58mm' ? '58mm' : '80mm';
    const baseFont = compactMode ? '11px' : '12px';
    const titleFont = compactMode ? '14px' : '16px';
    const padding = compactMode ? '6px' : '8px';

    return `
      @page {
        size: ${paperWidth} auto;
        margin: 0;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #000000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: ${baseFont};
        line-height: 1.35;
      }

      body {
        width: ${paperWidth};
      }

      .receipt {
        width: ${paperWidth};
        padding: ${padding};
        box-sizing: border-box;
      }

      .center {
        text-align: center;
      }

      .title {
        font-size: ${titleFont};
        font-weight: 700;
        margin-bottom: 4px;
      }

      .muted {
        font-size: ${baseFont};
        margin-bottom: 2px;
      }

      .divider {
        border-top: 1px dashed #000;
        margin: 8px 0;
      }

      .items {
        width: 100%;
      }

      .item {
        padding: 4px 0;
        border-bottom: 1px dotted #999;
      }

      .item-name {
        font-weight: 700;
        margin-bottom: 2px;
        word-break: break-word;
      }

      .item-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }

      .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 0;
      }

      .row.total {
        font-weight: 700;
        font-size: ${compactMode ? '12px' : '13px'};
      }

      .footer {
        margin-top: 8px;
        text-align: center;
        word-break: break-word;
      }

      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
  }

  function buildReceiptBody(sale) {
    const itemsHtml = (sale.items || []).map((item) => `
      <div class="item">
        <div class="item-name">${escapeHtml(item.name || '')}</div>
        <div class="item-meta">
          <span>Qtd: ${Number(item.quantity || 0)}</span>
          <span>${formatMoney(item.unitPrice || 0)}</span>
          <span>${formatMoney(item.total || 0)}</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="receipt">
        <div class="center">
          <div class="title">${escapeHtml(state.settings?.storeName || 'Minha Loja')}</div>
          <div class="muted">${escapeHtml(state.settings?.address || '')}</div>
          <div class="muted">CUPOM NÃO FISCAL</div>
          <div class="muted">${new Date().toLocaleString('pt-BR')}</div>
        </div>

        <div class="divider"></div>

        <div class="items">
          ${itemsHtml || '<div class="item">Sem itens</div>'}
        </div>

        <div class="divider"></div>

        <div class="row"><span>Subtotal</span><strong>${formatMoney(sale.subtotal || 0)}</strong></div>
        <div class="row"><span>Desconto</span><strong>${formatMoney(sale.discount || 0)}</strong></div>
        <div class="row total"><span>Total</span><strong>${formatMoney(sale.total || 0)}</strong></div>
        <div class="row"><span>Pagamento</span><strong>${escapeHtml(sale.paymentMethod || '-')}</strong></div>
        <div class="row"><span>Valor pago</span><strong>${formatMoney(sale.amountPaid || 0)}</strong></div>
        <div class="row"><span>Troco</span><strong>${formatMoney(sale.change || 0)}</strong></div>

        <div class="divider"></div>

        <div class="footer">
          ${escapeHtml(state.settings?.warrantyText || '')}
        </div>
      </div>
    `;
  }

  function buildReceiptHtmlDocument(sale) {
    return `
      <!doctype html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Cupom</title>
        <style>
          ${getThermalCss()}
        </style>
      </head>
      <body>
        ${buildReceiptBody(sale)}
        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 250);
          });

          window.addEventListener('afterprint', function () {
            setTimeout(function () {
              window.close();
            }, 150);
          });
        </script>
      </body>
      </html>
    `;
  }

  function printSaleReceipt(sale) {
    const html = buildReceiptHtmlDocument(sale);
    const printWindow = window.open('', '_blank', 'width=420,height=800');

    if (!printWindow) {
      showToast('Não foi possível abrir a janela de impressão.', 'error');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    if (!getPrintSettings().autoPrint) {
      showToast('Cupom aberto em modo pronto para impressão.', 'success');
    }
  }

  return {
    buildReceiptHtml: buildReceiptHtmlDocument,
    printSaleReceipt,
    getPrintSettings
  };
}