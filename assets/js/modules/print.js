import { showToast } from './ui.js';

export function createPrintModule(ctx) {
  const { state } = ctx;
  const UNIDENTIFIED_CUSTOMER = 'CLIENTE NÃO IDENTIFICADO';

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

  function formatMoneyPlain(value) {
    return Number(value || 0).toFixed(2).replace('.', ',');
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
    return (name || UNIDENTIFIED_CUSTOMER).toUpperCase();
  }

  function normalizeCustomerCpf(value) {
    const cpf = String(value || '').trim();
    return (cpf || 'NÃO INFORMADO').toUpperCase();
  }

  function repeatChar(char, count) {
    return new Array(Math.max(0, count) + 1).join(char);
  }

  function padRight(value, length) {
    const text = String(value ?? '');
    if (text.length >= length) return text.slice(0, length);
    return text + repeatChar(' ', length - text.length);
  }

  function padLeft(value, length) {
    const text = String(value ?? '');
    if (text.length >= length) return text.slice(0, length);
    return repeatChar(' ', length - text.length) + text;
  }

  function centerText(value, width) {
    const text = String(value ?? '');
    if (text.length >= width) return text.slice(0, width);
    const totalSpaces = width - text.length;
    const left = Math.floor(totalSpaces / 2);
    const right = totalSpaces - left;
    return repeatChar(' ', left) + text + repeatChar(' ', right);
  }

  function wrapText(text, width) {
    const raw = String(text || '').trim();
    if (!raw) return [''];

    const words = raw.split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
      if (!current) {
        if (word.length <= width) {
          current = word;
        } else {
          let rest = word;
          while (rest.length > width) {
            lines.push(rest.slice(0, width));
            rest = rest.slice(width);
          }
          current = rest;
        }
        continue;
      }

      const candidate = `${current} ${word}`;
      if (candidate.length <= width) {
        current = candidate;
      } else {
        lines.push(current);
        if (word.length <= width) {
          current = word;
        } else {
          let rest = word;
          while (rest.length > width) {
            lines.push(rest.slice(0, width));
            rest = rest.slice(width);
          }
          current = rest;
        }
      }
    }

    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function buildKeyValueLines(label, value, width, labelWidth = 12) {
    const safeLabel = `${String(label || '').trim().toUpperCase()}:`;
    const left = padRight(safeLabel, labelWidth);
    const rightWidth = Math.max(1, width - labelWidth);
    const wrapped = wrapText(String(value || '-').toUpperCase(), rightWidth);

    return wrapped.map((line, index) => {
      if (index === 0) return left + padRight(line, rightWidth);
      return repeatChar(' ', labelWidth) + padRight(line, rightWidth);
    });
  }

  function buildItemsText(items = [], width, is58mm) {
    if (!items.length) {
      return centerText('SEM ITENS LANCADOS.', width);
    }

    const qtyWidth = is58mm ? 3 : 4;
    const unitWidth = is58mm ? 8 : 10;
    const totalWidth = is58mm ? 9 : 11;
    const spacesBetween = 3;
    const productWidth = width - qtyWidth - unitWidth - totalWidth - spacesBetween;

    const header =
      padRight('PRODUTO', productWidth) +
      ' ' +
      padLeft('QTD', qtyWidth) +
      ' ' +
      padLeft('UNIT.', unitWidth) +
      ' ' +
      padLeft('TOTAL', totalWidth);

    const divider = repeatChar('-', width);

    const body = items.flatMap((item) => {
      const productLines = wrapText(String(item.name || '-').toUpperCase(), productWidth);
      const qty = padLeft(Number(item.quantity || 0), qtyWidth);
      const unit = padLeft(formatMoneyPlain(item.unitPrice || 0), unitWidth);
      const total = padLeft(formatMoneyPlain(item.total || 0), totalWidth);

      return productLines.map((line, index) => {
        if (index === 0) {
          return (
            padRight(line, productWidth) +
            ' ' +
            qty +
            ' ' +
            unit +
            ' ' +
            total
          );
        }

        return (
          padRight(line, productWidth) +
          ' ' +
          padLeft('', qtyWidth) +
          ' ' +
          padLeft('', unitWidth) +
          ' ' +
          padLeft('', totalWidth)
        );
      });
    });

    return [header, divider, ...body].join('\n');
  }

  function buildTotalsText(sale, width) {
    function line(label, value) {
      const rawValue = formatMoney(value);
      const labelPart = String(label || '').trim().toUpperCase();
      const valueWidth = rawValue.length;
      const leftWidth = Math.max(1, width - valueWidth - 1);
      return padRight(labelPart, leftWidth) + ' ' + rawValue;
    }

    return [
      line('Subtotal', sale.subtotal || 0),
      line('Desconto', sale.discount || 0),
      repeatChar('-', width),
      line('TOTAL', sale.total || 0),
      repeatChar('-', width),
      line('Valor pago', sale.amountPaid || 0),
      line('Troco', sale.change || 0)
    ].join('\n');
  }

  function buildSectionCentered(title, text, width) {
    const clean = String(text || '').trim().toUpperCase();
    if (!clean) return '';

    return [
      repeatChar('-', width),
      centerText(String(title || '').toUpperCase(), width),
      repeatChar('-', width),
      ...wrapText(clean, width).map((line) => centerText(line, width))
    ].join('\n');
  }

  function buildReceiptHtml(sale = {}) {
    const { thermalWidth, compactMode } = getPrintSettings();
    const is58mm = thermalWidth === '58mm';

    const widthPx = is58mm ? 230 : 320;
    const charsPerLine = is58mm ? 32 : 42;
    const bodyFontSize = compactMode ? (is58mm ? 10 : 11) : (is58mm ? 11 : 12);
    const headerFontSize = compactMode ? (is58mm ? 12 : 13) : (is58mm ? 13 : 15);
    const storeFontSize = compactMode ? (is58mm ? 14 : 16) : (is58mm ? 16 : 18);
    const padding = is58mm ? 8 : 10;

    const storeName = String(state.settings?.storeName || 'Gestão III').trim().toUpperCase();
    const address = String(state.settings?.address || '').trim().toUpperCase();
    const phone = String(state.settings?.phone || state.settings?.storePhone || '').trim().toUpperCase();
    const warrantyText = String(state.settings?.warrantyText || '').trim();

    const saleDateTime =
      String(sale.saleDateTimeLabel || '').trim() ||
      formatAnyDateTime(sale.createdAt) ||
      '-';

    const customerName = normalizeCustomerName(sale.customerName);
    const customerCpf = normalizeCustomerCpf(sale.customerCpf);

    const separator = repeatChar('-', charsPerLine);

    const headerText = [
      ...(storeName ? [centerText(storeName, charsPerLine)] : []),
      ...(address ? wrapText(address, charsPerLine).map((line) => centerText(line, charsPerLine)) : []),
      ...(phone ? wrapText(`TELEFONE: ${phone}`, charsPerLine).map((line) => centerText(line, charsPerLine)) : []),
      centerText('CUPOM NAO FISCAL', charsPerLine)
    ].join('\n');

    const bodyText = [
      separator,
      ...buildKeyValueLines('Data/Hora', saleDateTime, charsPerLine, 12),
      ...buildKeyValueLines('Cliente', customerName, charsPerLine, 12),
      ...buildKeyValueLines('CPF', customerCpf, charsPerLine, 12),
      ...buildKeyValueLines('Pagamento', sale.paymentMethod || '-', charsPerLine, 12),
      separator,
      centerText('ITENS', charsPerLine),
      separator,
      buildItemsText(Array.isArray(sale.items) ? sale.items : [], charsPerLine, is58mm),
      separator,
      buildTotalsText(sale, charsPerLine),
      warrantyText ? buildSectionCentered('GARANTIA', warrantyText, charsPerLine) : '',
      sale.notes ? buildSectionCentered('OBSERVACOES', sale.notes, charsPerLine) : '',
      separator,
      centerText('OBRIGADO PELA PREFERENCIA!', charsPerLine)
    ]
      .filter(Boolean)
      .join('\n');

    return `
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Cupom não fiscal</title>
          <style>
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #111111;
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
              padding: ${padding}px;
            }

            .receipt-header,
            .receipt-body {
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
              font-family: "Courier New", Courier, monospace;
              font-variant-numeric: tabular-nums;
              font-feature-settings: "tnum" 1;
            }

            .receipt-header {
              font-size: ${headerFontSize}px;
              line-height: 1.32;
              text-align: center;
              font-weight: 700;
              margin-bottom: 6px;
            }

            .store-name-line {
              font-size: ${storeFontSize}px;
              line-height: 1.2;
              font-weight: 900;
              letter-spacing: 0.4px;
            }

            .receipt-body {
              font-size: ${bodyFontSize}px;
              line-height: 1.38;
              font-weight: 700;
            }

            @page {
              margin: 0;
              size: auto;
            }

            @media print {
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
              }

              body {
                display: block;
              }

              .receipt {
                max-width: none;
                width: 100%;
                padding: ${padding}px;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <pre class="receipt-header">${escapeHtml(headerText)}</pre>
            <pre class="receipt-body">${escapeHtml(bodyText)}</pre>
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