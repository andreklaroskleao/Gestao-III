function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildReceiptHtml(state, sale) {
  const width = state.settings?.thermalWidth || '80mm';
  const compact = Boolean(state.settings?.thermalCompactMode);
  const storeName = state.settings?.storeName || 'Minha Loja';
  const address = state.settings?.address || '';
  const warrantyText = state.settings?.warrantyText || '';

  const itemsHtml = (sale.items || []).map((item) => `
    <div class="receipt-item">
      <div class="receipt-item-name">${esc(item.name || '-')}</div>
      <div class="receipt-item-line">
        <span>${Number(item.quantity || 0)} x ${money(item.unitPrice || 0)}</span>
        <strong>${money(item.total || 0)}</strong>
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Cupom</title>
        <style>
          @page {
            size: ${width} auto;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: #fff;
            color: #000;
          }

          .receipt {
            width: ${width === '58mm' ? '58mm' : '80mm'};
            padding: ${compact ? '6px 7px' : '10px 10px'};
            margin: 0 auto;
            font-size: ${compact ? '11px' : '12px'};
            line-height: 1.35;
          }

          .center {
            text-align: center;
          }

          .store-name {
            font-size: ${compact ? '14px' : '16px'};
            font-weight: 700;
            margin-bottom: 2px;
          }

          .muted {
            font-size: ${compact ? '10px' : '11px'};
          }

          .divider {
            border-top: 1px dashed #000;
            margin: ${compact ? '6px 0' : '8px 0'};
          }

          .receipt-line {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 2px 0;
          }

          .receipt-line.total {
            font-size: ${compact ? '12px' : '13px'};
            font-weight: 700;
            margin-top: 6px;
          }

          .receipt-item {
            margin: ${compact ? '4px 0' : '6px 0'};
          }

          .receipt-item-name {
            font-weight: 700;
            word-break: break-word;
          }

          .receipt-item-line {
            display: flex;
            justify-content: space-between;
            gap: 8px;
          }

          .footer {
            margin-top: 8px;
            text-align: center;
            font-size: ${compact ? '10px' : '11px'};
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="center">
            <div class="store-name">${esc(storeName)}</div>
            ${address ? `<div class="muted">${esc(address)}</div>` : ''}
          </div>

          <div class="divider"></div>

          <div class="receipt-line"><span>Cliente</span><strong>${esc(sale.customerName || 'Balcão')}</strong></div>
          <div class="receipt-line"><span>Pagamento</span><strong>${esc(sale.paymentMethod || '-')}</strong></div>

          <div class="divider"></div>

          ${itemsHtml || '<div class="center">Nenhum item</div>'}

          <div class="divider"></div>

          <div class="receipt-line"><span>Subtotal</span><strong>${money(sale.subtotal || 0)}</strong></div>
          <div class="receipt-line"><span>Desconto</span><strong>${money(sale.discount || 0)}</strong></div>
          <div class="receipt-line total"><span>Total</span><strong>${money(sale.total || 0)}</strong></div>
          <div class="receipt-line"><span>Valor pago</span><strong>${money(sale.amountPaid || 0)}</strong></div>
          <div class="receipt-line"><span>Troco</span><strong>${money(sale.change || 0)}</strong></div>

          ${warrantyText ? `
            <div class="divider"></div>
            <div class="footer">${esc(warrantyText)}</div>
          ` : ''}

          <div class="divider"></div>
          <div class="footer">Obrigado pela preferência</div>
        </div>
      </body>
    </html>
  `;
}

export function createPrintModule({ state }) {
  function printSaleReceipt(sale) {
    const html = buildReceiptHtml(state, sale);
    const win = window.open('', '_blank', 'width=420,height=720');

    if (!win) {
      alert('O navegador bloqueou a abertura da impressão.');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    const shouldAutoPrint = Boolean(state.settings?.thermalAutoPrint);

    win.onload = () => {
      if (shouldAutoPrint) {
        win.focus();
        win.print();
      }
    };
  }

  return {
    printSaleReceipt
  };
}