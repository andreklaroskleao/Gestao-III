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

  function buildReceiptHtml(sale) {
    const { thermalWidth, compactMode } = getPrintSettings();

    const itemsHtml = (sale.items || []).map((item) => `
      <tr>
        <td class="col-name">${escapeHtml(item.name)}</td>
        <td class="col-qty">${item.quantity}</td>
        <td class="col-unit">${Number(item.unitPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="col-total">${Number(item.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
      </tr>
    `).join('');

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Cupom</title>
  <style>
    @page { size: ${thermalWidth} auto; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      font-family: monospace;
      background: #fff;
      color: #000;
    }
    .receipt {
      width: ${thermalWidth};
      max-width: ${thermalWidth};
      padding: ${compactMode ? '6px' : '10px'};
      margin: 0 auto;
      font-size: ${compactMode ? '11px' : '12px'};
      line-height: 1.35;
    }
    .center { text-align: center; }
    .title {
      font-size: ${compactMode ? '14px' : '16px'};
      font-weight: 700;
      margin-bottom: 4px;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      padding: 2px 0;
      vertical-align: top;
      word-wrap: break-word;
    }
    .col-name { width: 42%; text-align: left; padding-right: 4px; }
    .col-qty { width: 12%; text-align: center; }
    .col-unit { width: 23%; text-align: right; padding-right: 4px; }
    .col-total { width: 23%; text-align: right; }
    .summary-line {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin: 2px 0;
    }
    .summary-total {
      font-weight: 700;
      font-size: ${compactMode ? '12px' : '13px'};
    }
    .footer {
      margin-top: 8px;
      text-align: center;
      font-size: ${compactMode ? '10px' : '11px'};
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="title">${escapeHtml(state.settings?.storeName || 'Minha Loja')}</div>
      <div>${escapeHtml(state.settings?.address || '')}</div>
      <div>CUPOM NÃO FISCAL</div>
      <div>${new Date().toLocaleString('pt-BR')}</div>
    </div>

    <div class="divider"></div>

    <table>
      <thead>
        <tr>
          <th class="col-name">Item</th>
          <th class="col-qty">Qtd</th>
          <th class="col-unit">Unit.</th>
          <th class="col-total">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="summary-line"><span>Subtotal</span><strong>${Number(sale.subtotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    <div class="summary-line"><span>Desconto</span><strong>${Number(sale.discount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    <div class="summary-line summary-total"><span>Total</span><strong>${Number(sale.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    <div class="summary-line"><span>Pagamento</span><strong>${escapeHtml(sale.paymentMethod || '-')}</strong></div>
    <div class="summary-line"><span>Valor pago</span><strong>${Number(sale.amountPaid || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
    <div class="summary-line"><span>Troco</span><strong>${Number(sale.change || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>

    <div class="divider"></div>

    <div class="footer">${escapeHtml(state.settings?.warrantyText || '')}</div>
  </div>
</body>
</html>`;
  }

  function printSaleReceipt(sale) {
    const html = buildReceiptHtml(sale);
    const win = window.open('', '_blank', 'width=420,height=800');

    if (!win) {
      showToast('Não foi possível abrir a janela de impressão.', 'error');
      return;
    }

    win.document.write(html);
    win.document.close();
    win.focus();

    if (getPrintSettings().autoPrint) {
      win.print();
    }
  }

  return {
    buildReceiptHtml,
    printSaleReceipt,
    getPrintSettings
  };
}